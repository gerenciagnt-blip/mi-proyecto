/**
 * Helpers internos consumidos por las server actions del chat.
 *
 * Estos helpers NO se exportan al cliente: solo `actions.ts` los importa.
 * Por eso este archivo no necesita `'use server'` (no es un módulo de
 * RSC para el cliente; es código de soporte server-side).
 *
 * Antes vivían inline en `actions.ts` (1242 LOC) — extraídos para reducir
 * el tamaño del archivo principal sin tocar la lógica de las actions.
 */

import { prisma } from '@pila/db';
import { emitirNotificacion } from '@/lib/notificaciones';
import { UMBRAL_FRIO_MS, DEDUP_MS, type MensajeReaccionItem } from './_shared';

/**
 * Devuelve el ID de la conversación si el user actual es participante, o
 * null si no lo es (o no existe). Usado por todas las acciones que tocan
 * una conversación específica como guard.
 */
export async function asegurarParticipante(userId: string, conversacionId: string) {
  const p = await prisma.conversacionParticipante.findUnique({
    where: { conversacionId_userId: { conversacionId, userId } },
    select: { conversacionId: true, rolEnConv: true },
  });
  return p;
}

/**
 * Sprint Chat · reacciones — agrupa la lista cruda de reacciones por emoji
 * y marca si el actor actual está dentro. Conserva el orden de aparición
 * del primer emoji (que es como salieron de Prisma con orderBy createdAt
 * asc).
 */
export function agruparReacciones(
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
export async function extraerMencionesValidas(
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

/**
 * Sprint Chat · notif bandeja — emite `CHAT_MENSAJE_NUEVO` a cada
 * participante destinatario que está "frío" (no leyó la conversación
 * en los últimos UMBRAL_FRIO_MS). Dedup de DEDUP_MS por (user, conv).
 *
 * Invocado fire-and-forget desde `enviarMensajeAction`. Errores se
 * silencian; el mensaje ya está creado y la sidebar va a mostrar el
 * badge igual aunque la notif falle.
 */
export async function emitirNotificacionesChat(params: {
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
