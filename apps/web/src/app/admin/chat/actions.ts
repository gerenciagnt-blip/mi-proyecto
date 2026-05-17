'use server';

import { revalidatePath } from 'next/cache';
import type { ConversacionTipo, ConversacionEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { validarParticipantes, whereUsuariosElegibles } from '@/lib/chat/elegibles';
import {
  MIMES_PERMITIDOS_CHAT,
  TAMANO_MAX_CHAT,
  MAX_ADJUNTOS_POR_MENSAJE,
  guardarAdjuntoChat,
} from '@/lib/chat/storage';
import { autoCerrarInactivasAction } from './cierre-actions';
import { emitirNotificacion } from '@/lib/notificaciones';
import { publishMany } from '@/lib/chat/bus';
import { esEmojiReaccionValido } from './constants';

/**
 * Sprint Chat · notif bandeja — umbral en ms para considerar a un
 * participante "frío" (no ha leído en X tiempo y por tanto se le emite
 * notificación al recibir un mensaje nuevo).
 */
const UMBRAL_FRIO_MS = 2 * 60 * 1000; // 2 min

/**
 * Ventana para dedup de notificaciones de chat: no se emite otra notif
 * para el mismo (user, conversacion) si hay una de hace <DEDUP_MS.
 */
const DEDUP_MS = 5 * 60 * 1000; // 5 min

export type ActionState = { error?: string; ok?: boolean };

const MAX_CONTENIDO = 4000;
const MAX_MENSAJES_PAGE = 100;

/** Roles considerados "staff" para reglas de calificación. */
function esStaffRole(role: string): boolean {
  return role === 'ADMIN' || role === 'SOPORTE';
}

// ============ Helpers internos ============

/**
 * Devuelve el ID de la conversación si el user actual es participante, o
 * null si no lo es (o no existe). Usado por todas las acciones que tocan
 * una conversación específica como guard.
 */
async function asegurarParticipante(userId: string, conversacionId: string) {
  const p = await prisma.conversacionParticipante.findUnique({
    where: { conversacionId_userId: { conversacionId, userId } },
    select: { conversacionId: true, rolEnConv: true },
  });
  return p;
}

// ============ Listado de conversaciones ============

export type ConversacionListItem = {
  id: string;
  tipo: ConversacionTipo;
  titulo: string;
  // Para DMs: el otherUserId — para abrir directo o linkar.
  otherUserId: string | null;
  ultimoMensajeAt: string | null;
  ultimoMensajePreview: string | null;
  ultimoMensajeAutorNombre: string | null;
  unreadCount: number;
  totalParticipantes: number;
  estado: ConversacionEstado;
  cerradaAt: string | null;
  ciclo: number;
};

/**
 * Lista las conversaciones del user actual, ordenadas por última actividad.
 * Para DMs el "titulo" se arma con el nombre del otro participante.
 */
export async function listarConversacionesAction(): Promise<
  | {
      ok: true;
      items: ConversacionListItem[];
    }
  | { ok: false; error: string }
> {
  const session = await requirePermiso('chat');
  const userId = session.user.id;

  // Sprint Chat · cierre+rating — antes de listar, oportunidad de
  // auto-cerrar conversaciones inactivas (>30 min sin mensajes). Es un
  // UPDATE barato cuando no hay candidatos (índice estado+ultimoMensajeAt).
  // Lo disparamos sin await deliberadamente: si falla por race con otro
  // cliente, no nos importa, la siguiente pasada lo intentará.
  void autoCerrarInactivasAction().catch(() => {});

  const convs = await prisma.conversacion.findMany({
    where: { participantes: { some: { userId } } },
    orderBy: [{ ultimoMensajeAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      participantes: {
        select: {
          userId: true,
          lastReadAt: true,
          user: { select: { name: true } },
        },
      },
      mensajes: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          contenido: true,
          createdAt: true,
          borradoAt: true,
          autor: { select: { name: true } },
          _count: { select: { adjuntos: { where: { eliminado: null } } } },
        },
      },
    },
  });

  // Sprint barrido HIGH H3 — antes: por cada conv hacíamos un
  // `prisma.mensaje.count()` (N+1 → 100 round-trips para 100 convs aun
  // dentro de Promise.all). Ahora hacemos UNA sola findMany de mensajes
  // no propios y agrupamos en JS aplicando el filtro `lastReadAt` por
  // conv. Trae solo {conversacionId, createdAt} → muy barato en bytes.
  const convIds = convs.map((c) => c.id);
  const lastReadByConv = new Map<string, Date | null>();
  for (const c of convs) {
    const me = c.participantes.find((p) => p.userId === userId);
    lastReadByConv.set(c.id, me?.lastReadAt ?? null);
  }
  const mensajesNoPropios =
    convIds.length === 0
      ? []
      : await prisma.mensaje.findMany({
          where: {
            conversacionId: { in: convIds },
            autorId: { not: userId },
            borradoAt: null,
          },
          select: { conversacionId: true, createdAt: true },
        });
  const unreadByConv = new Map<string, number>();
  for (const m of mensajesNoPropios) {
    const lastRead = lastReadByConv.get(m.conversacionId);
    if (!lastRead || m.createdAt > lastRead) {
      unreadByConv.set(m.conversacionId, (unreadByConv.get(m.conversacionId) ?? 0) + 1);
    }
  }

  const items: ConversacionListItem[] = convs.map((c) => {
    const otros = c.participantes.filter((p) => p.userId !== userId);
    const otherUserId = c.tipo === 'DM' && otros[0] ? otros[0].userId : null;
    const tituloDM = otros.map((p) => p.user.name).join(', ');
    const titulo =
      c.tipo === 'GRUPO' ? (c.nombre ?? '(Grupo sin nombre)') : tituloDM || '(Sin nombre)';
    const ultimo = c.mensajes[0] ?? null;
    const adjuntosUltimo = ultimo?._count.adjuntos ?? 0;
    const preview = ultimo
      ? ultimo.borradoAt
        ? '(Mensaje borrado)'
        : ultimo.contenido
          ? ultimo.contenido.length > 80
            ? `${ultimo.contenido.slice(0, 77)}…`
            : ultimo.contenido
          : adjuntosUltimo > 0
            ? `📷 ${adjuntosUltimo === 1 ? 'Imagen' : `${adjuntosUltimo} imágenes`}`
            : null
      : null;

    return {
      id: c.id,
      tipo: c.tipo,
      titulo,
      otherUserId,
      ultimoMensajeAt: c.ultimoMensajeAt?.toISOString() ?? null,
      ultimoMensajePreview: preview,
      ultimoMensajeAutorNombre: ultimo?.autor.name ?? null,
      unreadCount: unreadByConv.get(c.id) ?? 0,
      totalParticipantes: c.participantes.length,
      estado: c.estado,
      cerradaAt: c.cerradaAt?.toISOString() ?? null,
      ciclo: c.ciclo,
    };
  });

  return { ok: true, items };
}

// ============ Listado de mensajes ============

export type MensajeAdjuntoItem = {
  id: string;
  nombre: string;
  mime: string;
  tamano: number;
  ancho: number | null;
  alto: number | null;
  /** URL relativa para mostrar el archivo (apunta al endpoint /api/chat/adjuntos/...). */
  url: string;
};

/** Sprint Chat · reacciones — reacción de un emoji agrupada sobre un mensaje.
 *  - `count`: cuántos usuarios reaccionaron con este emoji.
 *  - `miReaccion`: true si el actor actual está entre ellos.
 *  - `usuarios`: nombres para tooltip (máximo razonable; si llegamos a
 *    grupos masivos truncar en cliente).
 */
export type MensajeReaccionItem = {
  emoji: string;
  count: number;
  miReaccion: boolean;
  usuarios: string[];
};

/** Sprint Chat · menciones — referencia simple al usuario mencionado.
 *  La UI usa el `name` para reemplazar la primera ocurrencia de `@<name>`
 *  en el texto por un chip; el `id` lo necesita para destacar cuando el
 *  mencionado soy yo. */
export type MensajeMencionItem = {
  id: string;
  name: string;
};

export type MensajeItem = {
  id: string;
  contenido: string;
  createdAt: string;
  editadoAt: string | null;
  borradoAt: string | null;
  autor: { id: string; name: string };
  adjuntos: MensajeAdjuntoItem[];
  /** Sprint Chat · reacciones — agrupadas por emoji. Vacío si nadie ha
   *  reaccionado, o si el mensaje está borrado (la BD las conserva pero la
   *  UI las oculta). */
  reacciones: MensajeReaccionItem[];
  /** Sprint Chat · menciones — users mencionados con @<nombre>. Vacío en
   *  mensajes borrados aunque la BD las conserve. */
  menciones: MensajeMencionItem[];
};

export type ConversacionMeta = {
  id: string;
  estado: ConversacionEstado;
  ciclo: number;
  cerradaAt: string | null;
  cerradaPorInactividad: boolean;
  cerradaPorNombre: string | null;
  tieneStaff: boolean;
  /** True si el actor es no-staff Y la conv tiene staff Y aún no calificó este ciclo. */
  debeCalificar: boolean;
  /** Sprint Chat · edit/delete — userId del actor actual, para que la UI
   *  decida si mostrar el menú "Editar/Borrar" en cada mensaje. */
  meId: string;
  /** True si el actor es ADMIN de la conv (puede borrar mensajes ajenos
   *  de no-staff). */
  soyAdminConv: boolean;
};

/**
 * Devuelve los mensajes de una conversación. Por defecto paginados desde
 * el más reciente; el cursor es el `createdAt` del mensaje más viejo del
 * batch anterior (para "cargar más antiguos").
 *
 * Marca implícitamente como leído al user actual.
 *
 * Sprint Chat · cierre+rating — además devuelve la meta de la conversación
 * (estado, ciclo, debe calificar) para que la UI decida si bloquea el
 * composer y/o muestra el modal de calificación.
 */
export async function listarMensajesAction(
  conversacionId: string,
  opts?: { antesDe?: string; limit?: number },
): Promise<
  | { ok: true; items: MensajeItem[]; hayMas: boolean; meta: ConversacionMeta }
  | { ok: false; error: string }
> {
  const session = await requirePermiso('chat');
  const userId = session.user.id;
  const userRole = session.user.role;
  const part = await asegurarParticipante(userId, conversacionId);
  if (!part) return { ok: false, error: 'No participas en esta conversación' };

  // Sprint barrido HIGH H2 — `asegurarParticipante` ya cargó `rolEnConv`,
  // reusarlo evita un findUnique extra que estaba duplicado. Antes había
  // una 3ª query a `conversacionParticipante.findUnique` para lo mismo.
  const soyAdminConv = part.rolEnConv === 'ADMIN';

  // Meta de la conversación (estado, ciclo, etc.) + chequeo de
  // "debe calificar" (no-staff + hay staff + ya cerrada + no calificó).
  const conv = await prisma.conversacion.findUnique({
    where: { id: conversacionId },
    select: {
      id: true,
      estado: true,
      ciclo: true,
      cerradaAt: true,
      cerradaPorInactividad: true,
      cerradaPor: { select: { name: true } },
      participantes: { select: { user: { select: { role: true } } } },
    },
  });
  if (!conv) return { ok: false, error: 'Conversación no encontrada' };

  const tieneStaff = conv.participantes.some((p) => esStaffRole(p.user.role));
  let debeCalificar = false;
  if (!esStaffRole(userRole) && tieneStaff) {
    const yaCalifico = await prisma.conversacionCalificacion.findUnique({
      where: {
        conversacionId_userId_ciclo: {
          conversacionId,
          userId,
          ciclo: conv.ciclo,
        },
      },
      select: { id: true },
    });
    // Solo prompteamos al aliado cuando la conv ya está cerrada; antes
    // del cierre puede calificar voluntariamente pero no se le empuja
    // el modal.
    debeCalificar = !yaCalifico && conv.estado === 'CERRADA';
  }

  const meta: ConversacionMeta = {
    id: conv.id,
    estado: conv.estado,
    ciclo: conv.ciclo,
    cerradaAt: conv.cerradaAt?.toISOString() ?? null,
    cerradaPorInactividad: conv.cerradaPorInactividad,
    cerradaPorNombre: conv.cerradaPor?.name ?? null,
    tieneStaff,
    debeCalificar,
    meId: userId,
    soyAdminConv,
  };

  const limit = Math.min(opts?.limit ?? 50, MAX_MENSAJES_PAGE);
  const antesDe = opts?.antesDe ? new Date(opts.antesDe) : undefined;

  const mensajes = await prisma.mensaje.findMany({
    where: {
      conversacionId,
      ...(antesDe ? { createdAt: { lt: antesDe } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // +1 para detectar si hay más
    select: {
      id: true,
      contenido: true,
      createdAt: true,
      editadoAt: true,
      borradoAt: true,
      autor: { select: { id: true, name: true } },
      adjuntos: {
        where: { eliminado: null },
        select: {
          id: true,
          archivoNombre: true,
          archivoMime: true,
          archivoTamano: true,
          ancho: true,
          alto: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      reacciones: {
        select: {
          emoji: true,
          userId: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      menciones: {
        select: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  const hayMas = mensajes.length > limit;
  const lote = hayMas ? mensajes.slice(0, limit) : mensajes;

  return {
    ok: true,
    hayMas,
    meta,
    items: lote
      .map((m) => ({
        id: m.id,
        contenido: m.borradoAt ? '(Mensaje borrado)' : m.contenido,
        createdAt: m.createdAt.toISOString(),
        editadoAt: m.editadoAt?.toISOString() ?? null,
        borradoAt: m.borradoAt?.toISOString() ?? null,
        autor: m.autor,
        adjuntos: m.borradoAt
          ? []
          : m.adjuntos.map((a) => ({
              id: a.id,
              nombre: a.archivoNombre,
              mime: a.archivoMime,
              tamano: a.archivoTamano,
              ancho: a.ancho,
              alto: a.alto,
              url: `/api/chat/adjuntos/${a.id}`,
            })),
        // En borrados ocultamos las reacciones aunque existan en BD.
        reacciones: m.borradoAt ? [] : agruparReacciones(m.reacciones, userId),
        menciones: m.borradoAt
          ? []
          : m.menciones.map((x) => ({ id: x.user.id, name: x.user.name })),
      }))
      .reverse(), // viejo → nuevo para render
  };
}

/**
 * Sprint Chat · reacciones — agrupa la lista cruda de reacciones por emoji
 * y marca si el actor actual está dentro. Conserva el orden de aparición
 * del primer emoji (que es como salieron de Prisma con orderBy createdAt
 * asc).
 */
function agruparReacciones(
  raw: { emoji: string; userId: string; user: { name: string } }[],
  meId: string,
): MensajeReaccionItem[] {
  const byEmoji = new Map<string, MensajeReaccionItem>();
  for (const r of raw) {
    let item = byEmoji.get(r.emoji);
    if (!item) {
      item = { emoji: r.emoji, count: 0, miReaccion: false, usuarios: [] };
      byEmoji.set(r.emoji, item);
    }
    item.count += 1;
    item.usuarios.push(r.user.name);
    if (r.userId === meId) item.miReaccion = true;
  }
  return Array.from(byEmoji.values());
}

/**
 * Sprint Chat · menciones — dado un FormData ya validado, extrae el array
 * `mencion` (varias entries) y devuelve los userIds validados como
 * participantes de la conversación. Filtra duplicados y al propio actor
 * (auto-mencionarse no genera notif).
 */
async function extraerMencionesValidas(
  formData: FormData,
  conversacionId: string,
  autorId: string,
): Promise<{ id: string; name: string }[]> {
  const raw = formData
    .getAll('mencion')
    .map((v) => String(v))
    .filter(Boolean);
  if (raw.length === 0) return [];
  // Dedup + filtra al autor.
  const candidatos = Array.from(new Set(raw)).filter((id) => id !== autorId);
  if (candidatos.length === 0) return [];

  // Solo aceptamos IDs que sean participantes ACTUALES de la conversación.
  const validos = await prisma.conversacionParticipante.findMany({
    where: { conversacionId, userId: { in: candidatos } },
    select: { user: { select: { id: true, name: true } } },
  });
  return validos.map((p) => p.user);
}

// ============ Enviar mensaje ============

/**
 * Sprint Chat interno · adjuntos — `enviarMensajeAction` recibe FormData
 * porque los archivos requieren multipart. La forma:
 *
 *   - conversacionId: string
 *   - contenido: string (puede ser vacío si hay al menos 1 adjunto)
 *   - archivo: File[] (usar `formData.getAll('archivo')`)
 *   - dim:<i>: string opcional con formato "WxH" para el archivo i
 *
 * Valida MIME/size por archivo y enforce `MAX_ADJUNTOS_POR_MENSAJE`.
 * Persiste mensaje + adjuntos en una transacción. Los archivos físicos
 * se escriben a disco ANTES de la tx (si la tx falla, queda un archivo
 * huérfano — vivo con ello, alternativa sería 2-fase commit).
 */
export async function enviarMensajeAction(
  formData: FormData,
): Promise<{ ok: true; mensaje: MensajeItem } | { ok: false; error: string }> {
  const session = await requirePermiso('chat');
  const userId = session.user.id;

  const conversacionId = String(formData.get('conversacionId') ?? '').trim();
  if (!conversacionId) return { ok: false, error: 'Conversación inválida' };

  const contenido = String(formData.get('contenido') ?? '').trim();
  const archivos = formData
    .getAll('archivo')
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!contenido && archivos.length === 0) {
    return { ok: false, error: 'El mensaje está vacío' };
  }
  if (contenido.length > MAX_CONTENIDO) {
    return { ok: false, error: `El mensaje excede ${MAX_CONTENIDO} caracteres` };
  }
  if (archivos.length > MAX_ADJUNTOS_POR_MENSAJE) {
    return {
      ok: false,
      error: `Máximo ${MAX_ADJUNTOS_POR_MENSAJE} adjuntos por mensaje`,
    };
  }

  for (const f of archivos) {
    if (!(MIMES_PERMITIDOS_CHAT as readonly string[]).includes(f.type)) {
      return { ok: false, error: `Tipo de archivo no permitido: ${f.type || f.name}` };
    }
    if (f.size > TAMANO_MAX_CHAT) {
      return {
        ok: false,
        error: `"${f.name}" supera el tamaño máximo (5 MB)`,
      };
    }
  }

  const part = await asegurarParticipante(userId, conversacionId);
  if (!part) return { ok: false, error: 'No participas en esta conversación' };

  // Sprint Chat · cierre+rating — bloquear envío en conv CERRADA.
  // Devuelve un mensaje accionable: el cliente puede ofrecer "Reabrir".
  const estado = await prisma.conversacion.findUnique({
    where: { id: conversacionId },
    select: { estado: true },
  });
  if (estado?.estado === 'CERRADA') {
    return {
      ok: false,
      error: 'La conversación está cerrada. Reábrela antes de enviar mensajes.',
    };
  }

  // Subo los archivos a disco antes de la transacción. Si la tx falla
  // dejaremos archivos huérfanos (poco probable; aceptable para v1).
  const adjuntosGuardados: Array<{
    archivoPath: string;
    archivoHash: string;
    archivoMime: string;
    archivoNombre: string;
    archivoTamano: number;
    ancho: number | null;
    alto: number | null;
  }> = [];
  for (let i = 0; i < archivos.length; i += 1) {
    const f = archivos[i]!;
    const buf = Buffer.from(await f.arrayBuffer());
    const saved = await guardarAdjuntoChat(buf, f.name, conversacionId);

    // Dimensiones opcionales que envía el cliente — "dim:<i>" = "WxH"
    const dimRaw = String(formData.get(`dim:${i}`) ?? '');
    let ancho: number | null = null;
    let alto: number | null = null;
    const m = /^(\d+)x(\d+)$/.exec(dimRaw);
    if (m) {
      ancho = Number(m[1]);
      alto = Number(m[2]);
    }

    adjuntosGuardados.push({
      archivoPath: saved.path,
      archivoHash: saved.hash,
      archivoMime: f.type,
      archivoNombre: f.name.slice(0, 200),
      archivoTamano: saved.size,
      ancho,
      alto,
    });
  }

  // Sprint Chat · menciones — extraemos las menciones validadas antes
  // de la transacción para fallar temprano si no hay participantes.
  // Lista de { id, name } — vacía si no había `mencion` en el FormData
  // o ninguno era participante.
  const menciones = await extraerMencionesValidas(formData, conversacionId, userId);

  const ahora = new Date();
  const mensaje = await prisma.$transaction(async (tx) => {
    const m = await tx.mensaje.create({
      data: {
        conversacionId,
        autorId: userId,
        contenido,
        adjuntos: adjuntosGuardados.length ? { create: adjuntosGuardados } : undefined,
        menciones: menciones.length
          ? { create: menciones.map((u) => ({ userId: u.id })) }
          : undefined,
      },
      select: {
        id: true,
        contenido: true,
        createdAt: true,
        editadoAt: true,
        borradoAt: true,
        autor: { select: { id: true, name: true } },
        adjuntos: {
          select: {
            id: true,
            archivoNombre: true,
            archivoMime: true,
            archivoTamano: true,
            ancho: true,
            alto: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // Mover el cursor de "leído" del autor al instante de envío.
    await tx.conversacionParticipante.update({
      where: { conversacionId_userId: { conversacionId, userId } },
      data: { lastReadAt: ahora },
    });
    // Denormalización: actualiza `ultimoMensajeAt` para ordenar la lista.
    await tx.conversacion.update({
      where: { id: conversacionId },
      data: { ultimoMensajeAt: ahora },
    });
    return m;
  });

  // Sprint Chat · SSE — publicar al bus para empujar el evento a todos
  // los participantes conectados por SSE. Fire-and-forget. Si no hay
  // subscriptores en esta instancia, no hace nada — el polling SWR
  // (cada 8s) garantiza el fallback eventual.
  try {
    const todosParticipantes = await prisma.conversacionParticipante.findMany({
      where: { conversacionId },
      select: { userId: true },
    });
    publishMany(
      todosParticipantes.map((p) => p.userId),
      { tipo: 'mensaje', conversacionId },
    );
  } catch {
    // no rompemos el envío por un fallo del bus
  }

  // Sprint Chat · notif bandeja — emitimos `CHAT_MENSAJE_NUEVO` a los
  // participantes destinatarios que NO han abierto la conversación en
  // los últimos 2 min (chat "frío"). Dedup natural: si ya hay una notif
  // del mismo (user, conv) en los últimos 5 min, no creamos otra.
  // Fire-and-forget: si falla, el mensaje ya está creado.
  void emitirNotificacionesChat({
    conversacionId,
    autorId: userId,
    autorNombre: mensaje.autor.name,
    contenidoPreview: contenido || `📷 ${archivos.length} imagen${archivos.length > 1 ? 'es' : ''}`,
    ahora,
  }).catch(() => {});

  // Sprint Chat · menciones — emitimos `CHAT_MENCION` a cada mencionado.
  // SIN dedup ni umbral frío: una mención es una llamada directa, debe
  // notificarse aunque ya haya otra notif del chat reciente.
  if (menciones.length > 0) {
    const previewMencion =
      contenido.length > 0
        ? contenido.length > 120
          ? `${contenido.slice(0, 117)}…`
          : contenido
        : `📷 ${archivos.length} imagen${archivos.length > 1 ? 'es' : ''}`;
    for (const u of menciones) {
      void emitirNotificacion({
        tipo: 'CHAT_MENCION',
        destinoUserId: u.id,
        titulo: `${mensaje.autor.name} te mencionó`,
        mensaje: previewMencion,
        href: `/admin?chatconv=${conversacionId}`,
        metadatos: { conversacionId, mensajeId: mensaje.id },
      }).catch(() => {});
    }
  }

  revalidatePath('/admin/chat');
  return {
    ok: true,
    mensaje: {
      id: mensaje.id,
      contenido: mensaje.contenido,
      createdAt: mensaje.createdAt.toISOString(),
      editadoAt: mensaje.editadoAt?.toISOString() ?? null,
      borradoAt: mensaje.borradoAt?.toISOString() ?? null,
      autor: mensaje.autor,
      adjuntos: mensaje.adjuntos.map((a) => ({
        id: a.id,
        nombre: a.archivoNombre,
        mime: a.archivoMime,
        tamano: a.archivoTamano,
        ancho: a.ancho,
        alto: a.alto,
        url: `/api/chat/adjuntos/${a.id}`,
      })),
      // Mensaje recién creado — todavía no tiene reacciones.
      reacciones: [],
      menciones: menciones.map((u) => ({ id: u.id, name: u.name })),
    },
  };
}

// ============ Marcar leído ============

export async function marcarLeidoAction(conversacionId: string): Promise<ActionState> {
  const session = await requirePermiso('chat');
  const userId = session.user.id;
  const part = await asegurarParticipante(userId, conversacionId);
  if (!part) return { error: 'No participas en esta conversación' };

  await prisma.conversacionParticipante.update({
    where: { conversacionId_userId: { conversacionId, userId } },
    data: { lastReadAt: new Date() },
  });
  return { ok: true };
}

// ============ Participantes (para autocomplete de @menciones) ============

/** Sprint Chat · menciones — item del autocomplete de `@` en el composer. */
export type ParticipanteAutocomplete = {
  id: string;
  name: string;
  email: string;
  role: string;
};

/**
 * Devuelve los participantes de una conversación (excluyendo al actor)
 * para el autocomplete de menciones del composer. El cliente filtra por
 * prefijo de `name` localmente — la lista es pequeña (<20 típico).
 */
export async function listarParticipantesAction(
  conversacionId: string,
): Promise<{ ok: true; items: ParticipanteAutocomplete[] } | { ok: false; error: string }> {
  const session = await requirePermiso('chat');
  const userId = session.user.id;
  const part = await asegurarParticipante(userId, conversacionId);
  if (!part) return { ok: false, error: 'No participas en esta conversación' };

  const rows = await prisma.conversacionParticipante.findMany({
    where: { conversacionId, userId: { not: userId } },
    select: {
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
    orderBy: { user: { name: 'asc' } },
  });
  return {
    ok: true,
    items: rows.map((r) => ({
      id: r.user.id,
      name: r.user.name,
      email: r.user.email,
      role: r.user.role,
    })),
  };
}

// ============ Crear conversación ============

export type CrearConversacionResult =
  | { ok: true; conversacionId: string; existente: boolean }
  | { ok: false; error: string };

export async function crearConversacionAction(params: {
  tipo: ConversacionTipo;
  nombre?: string;
  participantesIds: string[];
}): Promise<CrearConversacionResult> {
  const session = await requirePermiso('chat');
  const actor = {
    userId: session.user.id,
    role: session.user.role,
    sucursalId: session.user.sucursalId,
  };

  const tipo = params.tipo;
  if (tipo === 'DM' && params.participantesIds.length !== 1) {
    return { ok: false, error: 'Un DM requiere exactamente un destinatario' };
  }
  if (tipo === 'GRUPO' && params.participantesIds.length < 1) {
    return { ok: false, error: 'Selecciona al menos un participante' };
  }
  if (tipo === 'GRUPO') {
    const nombre = (params.nombre ?? '').trim();
    if (!nombre) return { ok: false, error: 'El grupo necesita un nombre' };
    if (nombre.length > 80) return { ok: false, error: 'El nombre del grupo es muy largo' };
  }

  const err = await validarParticipantes(actor, params.participantesIds);
  if (err) return { ok: false, error: err };

  // Para DM: si ya existe una conversación entre los dos users, la
  // reutilizamos (idempotencia). El esquema actual no tiene un índice
  // único compuesto por participantes — buscamos por participantes.some.
  if (tipo === 'DM') {
    const otroId = params.participantesIds[0]!;
    const existente = await prisma.conversacion.findFirst({
      where: {
        tipo: 'DM',
        AND: [
          { participantes: { some: { userId: actor.userId } } },
          { participantes: { some: { userId: otroId } } },
        ],
      },
      select: { id: true, participantes: { select: { userId: true } } },
    });
    if (existente && existente.participantes.length === 2) {
      return { ok: true, conversacionId: existente.id, existente: true };
    }
  }

  const ahora = new Date();
  const conv = await prisma.conversacion.create({
    data: {
      tipo,
      nombre: tipo === 'GRUPO' ? params.nombre!.trim() : null,
      createdById: actor.userId,
      ultimoMensajeAt: null,
      participantes: {
        create: [
          { userId: actor.userId, rolEnConv: 'ADMIN', lastReadAt: ahora },
          ...params.participantesIds.map((uid) => ({
            userId: uid,
            rolEnConv: 'MIEMBRO' as const,
          })),
        ],
      },
    },
    select: { id: true },
  });

  revalidatePath('/admin/chat');
  return { ok: true, conversacionId: conv.id, existente: false };
}

// ============ Buscador de elegibles ============

export type UsuarioElegible = {
  id: string;
  name: string;
  email: string;
  role: string;
  sucursalCodigo: string | null;
};

/**
 * Devuelve users elegibles para el actor, opcionalmente filtrados por
 * texto libre (busca en name + email). Usado por el modal "nuevo chat".
 */
export async function buscarUsuariosElegiblesAction(
  q?: string,
): Promise<{ ok: true; items: UsuarioElegible[] } | { ok: false; error: string }> {
  const session = await requirePermiso('chat');
  const actor = {
    userId: session.user.id,
    role: session.user.role,
    sucursalId: session.user.sucursalId,
  };

  const baseWhere = whereUsuariosElegibles(actor);
  const where =
    q && q.trim()
      ? {
          ...baseWhere,
          OR: [
            { name: { contains: q.trim(), mode: 'insensitive' as const } },
            { email: { contains: q.trim(), mode: 'insensitive' as const } },
          ],
        }
      : baseWhere;

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ name: 'asc' }],
    take: 30,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      sucursal: { select: { codigo: true } },
    },
  });

  return {
    ok: true,
    items: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      sucursalCodigo: u.sucursal?.codigo ?? null,
    })),
  };
}

// ============ Notificaciones bandeja (chat "frío") ============

/**
 * Sprint Chat · notif bandeja — emite `CHAT_MENSAJE_NUEVO` a cada
 * participante destinatario que está "frío" (no leyó la conversación
 * en los últimos 2 min). Dedup de 5 min por (user, conv).
 *
 * Helper interno — invocado fire-and-forget desde `enviarMensajeAction`.
 * Errores se silencian; el mensaje ya está creado y la sidebar va a
 * mostrar el badge igual aunque la notif falle.
 */
async function emitirNotificacionesChat(params: {
  conversacionId: string;
  autorId: string;
  autorNombre: string;
  contenidoPreview: string;
  ahora: Date;
}) {
  const { conversacionId, autorId, autorNombre, contenidoPreview, ahora } = params;
  const corteFrio = new Date(ahora.getTime() - UMBRAL_FRIO_MS);
  const corteDedup = new Date(ahora.getTime() - DEDUP_MS);

  // Participantes que NO son el autor y están "fríos".
  const candidatos = await prisma.conversacionParticipante.findMany({
    where: {
      conversacionId,
      userId: { not: autorId },
      OR: [{ lastReadAt: null }, { lastReadAt: { lt: corteFrio } }],
    },
    select: { userId: true },
  });
  if (candidatos.length === 0) return;

  // Para cada candidato, chequeo dedup y emito si aplica.
  const titulo = `Nuevo mensaje de ${autorNombre}`;
  const mensaje =
    contenidoPreview.length > 120 ? `${contenidoPreview.slice(0, 117)}…` : contenidoPreview;

  // Nota: hacemos las consultas en serie para no pisar el rate-limit
  // accidentalmente. El N suele ser <10 — costo despreciable.
  for (const p of candidatos) {
    const reciente = await prisma.notificacion.findFirst({
      where: {
        tipo: 'CHAT_MENSAJE_NUEVO',
        destinoUserId: p.userId,
        createdAt: { gt: corteDedup },
        metadatos: {
          path: ['conversacionId'],
          equals: conversacionId,
        },
      },
      select: { id: true },
    });
    if (reciente) continue;

    await emitirNotificacion({
      tipo: 'CHAT_MENSAJE_NUEVO',
      destinoUserId: p.userId,
      titulo,
      mensaje,
      // Deep-link al widget de chat con la conv pre-abierta.
      href: `/admin?chatconv=${conversacionId}`,
      metadatos: { conversacionId },
    });
  }
}

// ============ Editar / Borrar mensaje ============

/**
 * Sprint Chat · edit — ventana para editar un mensaje. Después de N
 * minutos del envío, el botón "Editar" desaparece (la edición no debe
 * cambiar mensajes muy viejos que la otra parte ya leyó/citó).
 */
const VENTANA_EDIT_MS = 15 * 60 * 1000; // 15 min

/**
 * Edita el contenido de un mensaje propio. Solo el autor puede editar,
 * solo si la conv está ABIERTA y el mensaje no está borrado, y solo
 * dentro de los primeros 15 min desde el envío.
 *
 * Marca `editadoAt = now` para que la UI muestre "(editado)". El
 * contenido viejo se pierde (no hay historial).
 */
export async function editarMensajeAction(
  mensajeId: string,
  nuevoContenido: string,
): Promise<{ ok: true; mensaje: MensajeItem } | { ok: false; error: string }> {
  const session = await requirePermiso('chat');
  const userId = session.user.id;

  const contenido = nuevoContenido.trim();
  if (!contenido) return { ok: false, error: 'El mensaje no puede quedar vacío' };
  if (contenido.length > MAX_CONTENIDO) {
    return { ok: false, error: `Excede ${MAX_CONTENIDO} caracteres` };
  }

  const m = await prisma.mensaje.findUnique({
    where: { id: mensajeId },
    select: {
      autorId: true,
      borradoAt: true,
      createdAt: true,
      conversacionId: true,
      conversacion: { select: { estado: true } },
    },
  });
  if (!m) return { ok: false, error: 'Mensaje no encontrado' };
  if (m.autorId !== userId) return { ok: false, error: 'Solo el autor puede editar el mensaje' };
  if (m.borradoAt) return { ok: false, error: 'El mensaje fue borrado' };
  if (m.conversacion.estado === 'CERRADA') {
    return { ok: false, error: 'No se pueden editar mensajes de una conversación cerrada' };
  }
  if (Date.now() - m.createdAt.getTime() > VENTANA_EDIT_MS) {
    return { ok: false, error: 'Ventana de edición expirada (15 min desde envío)' };
  }

  const actualizado = await prisma.mensaje.update({
    where: { id: mensajeId },
    data: { contenido, editadoAt: new Date() },
    select: {
      id: true,
      contenido: true,
      createdAt: true,
      editadoAt: true,
      borradoAt: true,
      conversacionId: true,
      autor: { select: { id: true, name: true } },
      adjuntos: {
        where: { eliminado: null },
        select: {
          id: true,
          archivoNombre: true,
          archivoMime: true,
          archivoTamano: true,
          ancho: true,
          alto: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      reacciones: {
        select: {
          emoji: true,
          userId: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      menciones: {
        select: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  // Empuja al bus para que todos los clientes refresquen.
  try {
    const todos = await prisma.conversacionParticipante.findMany({
      where: { conversacionId: actualizado.conversacionId },
      select: { userId: true },
    });
    publishMany(
      todos.map((p) => p.userId),
      { tipo: 'mensaje', conversacionId: actualizado.conversacionId },
    );
  } catch {
    // ignorar — la mutación SWR del cliente que llamó la action funciona como fallback
  }

  return {
    ok: true,
    mensaje: {
      id: actualizado.id,
      contenido: actualizado.contenido,
      createdAt: actualizado.createdAt.toISOString(),
      editadoAt: actualizado.editadoAt?.toISOString() ?? null,
      borradoAt: actualizado.borradoAt?.toISOString() ?? null,
      autor: actualizado.autor,
      adjuntos: actualizado.adjuntos.map((a) => ({
        id: a.id,
        nombre: a.archivoNombre,
        mime: a.archivoMime,
        tamano: a.archivoTamano,
        ancho: a.ancho,
        alto: a.alto,
        url: `/api/chat/adjuntos/${a.id}`,
      })),
      reacciones: agruparReacciones(actualizado.reacciones, userId),
      // En v1 las menciones quedan fijadas al envío inicial: editar el
      // texto no recalcula menciones (no abrimos puerta a spam de notif).
      menciones: actualizado.menciones.map((x) => ({ id: x.user.id, name: x.user.name })),
    },
  };
}

/**
 * Borra un mensaje (soft-delete). Pueden borrar:
 *   - El autor del mensaje, en cualquier momento.
 *   - Un participante con rol `ADMIN` en la conversación (moderador del
 *     grupo), si el autor del mensaje NO es staff (el staff es
 *     intocable para moderadores externos — para borrar mensajes de
 *     soporte hay que ir vía la propia cuenta de soporte).
 *
 * Marca `borradoAt = now`. El contenido queda en BD pero la UI muestra
 * "(Mensaje borrado)". Los adjuntos asociados también se ocultan
 * (`listarMensajesAction` ya filtra cuando el mensaje está borrado).
 */
export async function borrarMensajeAction(mensajeId: string): Promise<ActionState> {
  const session = await requirePermiso('chat');
  const userId = session.user.id;

  const m = await prisma.mensaje.findUnique({
    where: { id: mensajeId },
    select: {
      autorId: true,
      borradoAt: true,
      conversacionId: true,
      autor: { select: { role: true } },
    },
  });
  if (!m) return { error: 'Mensaje no encontrado' };
  if (m.borradoAt) return { ok: true }; // idempotente

  const esAutor = m.autorId === userId;
  let permitido = esAutor;

  if (!permitido) {
    // Chequear si es ADMIN de la conv (moderador). Solo aplica si el
    // autor NO es staff.
    if (m.autor.role !== 'ADMIN' && m.autor.role !== 'SOPORTE') {
      const part = await prisma.conversacionParticipante.findUnique({
        where: { conversacionId_userId: { conversacionId: m.conversacionId, userId } },
        select: { rolEnConv: true },
      });
      if (part?.rolEnConv === 'ADMIN') permitido = true;
    }
  }

  if (!permitido) {
    return { error: 'No tienes permiso para borrar este mensaje' };
  }

  await prisma.mensaje.update({
    where: { id: mensajeId },
    data: { borradoAt: new Date() },
  });

  // Bus: empuja a todos los participantes.
  try {
    const todos = await prisma.conversacionParticipante.findMany({
      where: { conversacionId: m.conversacionId },
      select: { userId: true },
    });
    publishMany(
      todos.map((p) => p.userId),
      { tipo: 'mensaje', conversacionId: m.conversacionId },
    );
  } catch {
    // ignorar
  }

  return { ok: true };
}

/**
 * Sprint Chat · reacciones — togglea la reacción del actor sobre un
 * mensaje:
 *   - Si ya tiene esa reacción (mismo emoji), la quita.
 *   - Si no la tiene, la crea.
 *
 * Reglas:
 *   - Actor debe ser participante de la conversación.
 *   - El emoji debe estar en `EMOJIS_REACCION_VALIDOS`.
 *   - No se permite reaccionar a un mensaje borrado.
 *   - No se permite reaccionar a un mensaje de una conversación cerrada
 *     (mantiene el invariante "conv cerrada = no mutaciones").
 *
 * Publica al bus para que el resto de participantes refresquen.
 */
export async function toggleReaccionAction(mensajeId: string, emoji: string): Promise<ActionState> {
  const session = await requirePermiso('chat');
  const userId = session.user.id;

  if (!esEmojiReaccionValido(emoji)) {
    return { error: 'Emoji no permitido' };
  }

  const m = await prisma.mensaje.findUnique({
    where: { id: mensajeId },
    select: {
      conversacionId: true,
      borradoAt: true,
      conversacion: { select: { estado: true } },
    },
  });
  if (!m) return { error: 'Mensaje no encontrado' };
  if (m.borradoAt) return { error: 'No puedes reaccionar a un mensaje borrado' };
  if (m.conversacion.estado === 'CERRADA') {
    return { error: 'No puedes reaccionar en una conversación cerrada' };
  }

  // El actor debe ser participante.
  const part = await prisma.conversacionParticipante.findUnique({
    where: { conversacionId_userId: { conversacionId: m.conversacionId, userId } },
    select: { conversacionId: true },
  });
  if (!part) return { error: 'No participas en esta conversación' };

  // Toggle por unique (mensajeId, userId, emoji): si existe, borra; si no, crea.
  const existente = await prisma.mensajeReaccion.findUnique({
    where: { mensajeId_userId_emoji: { mensajeId, userId, emoji } },
    select: { id: true },
  });
  if (existente) {
    await prisma.mensajeReaccion.delete({ where: { id: existente.id } });
  } else {
    await prisma.mensajeReaccion.create({
      data: { mensajeId, userId, emoji },
    });
  }

  // Bus: empuja a todos los participantes para refrescar.
  try {
    const todos = await prisma.conversacionParticipante.findMany({
      where: { conversacionId: m.conversacionId },
      select: { userId: true },
    });
    publishMany(
      todos.map((p) => p.userId),
      { tipo: 'mensaje', conversacionId: m.conversacionId },
    );
  } catch {
    // ignorar
  }

  return { ok: true };
}
