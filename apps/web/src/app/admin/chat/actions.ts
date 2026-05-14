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

  const items: ConversacionListItem[] = await Promise.all(
    convs.map(async (c) => {
      const me = c.participantes.find((p) => p.userId === userId);
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

      // unreadCount = mensajes en la conv con createdAt > lastReadAt del user,
      // del autor distinto al user (los propios siempre cuentan como leídos).
      const lastReadAt = me?.lastReadAt;
      const unread = await prisma.mensaje.count({
        where: {
          conversacionId: c.id,
          autorId: { not: userId },
          borradoAt: null,
          ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
        },
      });

      return {
        id: c.id,
        tipo: c.tipo,
        titulo,
        otherUserId,
        ultimoMensajeAt: c.ultimoMensajeAt?.toISOString() ?? null,
        ultimoMensajePreview: preview,
        ultimoMensajeAutorNombre: ultimo?.autor.name ?? null,
        unreadCount: unread,
        totalParticipantes: c.participantes.length,
        estado: c.estado,
        cerradaAt: c.cerradaAt?.toISOString() ?? null,
        ciclo: c.ciclo,
      };
    }),
  );

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

export type MensajeItem = {
  id: string;
  contenido: string;
  createdAt: string;
  editadoAt: string | null;
  borradoAt: string | null;
  autor: { id: string; name: string };
  adjuntos: MensajeAdjuntoItem[];
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
      }))
      .reverse(), // viejo → nuevo para render
  };
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

  const ahora = new Date();
  const mensaje = await prisma.$transaction(async (tx) => {
    const m = await tx.mensaje.create({
      data: {
        conversacionId,
        autorId: userId,
        contenido,
        adjuntos: adjuntosGuardados.length ? { create: adjuntosGuardados } : undefined,
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
