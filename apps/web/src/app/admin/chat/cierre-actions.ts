'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { publishMany } from '@/lib/chat/bus';

export type ActionState = { error?: string; ok?: boolean };

/**
 * Sprint Chat · SSE — publica un evento `conv-updated` a todos los
 * participantes de la conversación. Se usa al cerrar/reabrir/marcar
 * leído para que los clientes conectados refresquen al instante.
 * Fire-and-forget.
 */
async function publishConvUpdate(conversacionId: string) {
  try {
    const participantes = await prisma.conversacionParticipante.findMany({
      where: { conversacionId },
      select: { userId: true },
    });
    publishMany(
      participantes.map((p) => p.userId),
      { tipo: 'conv-updated', conversacionId },
    );
  } catch {
    // best-effort
  }
}

/** Inactividad que dispara auto-cierre (30 min). */
const INACTIVIDAD_MS = 30 * 60 * 1000;

/** Roles considerados "staff" para reglas de calificación. */
function esStaff(role: string): boolean {
  return role === 'ADMIN' || role === 'SOPORTE';
}

async function asegurarParticipante(userId: string, conversacionId: string) {
  return prisma.conversacionParticipante.findUnique({
    where: { conversacionId_userId: { conversacionId, userId } },
    select: { conversacionId: true },
  });
}

/**
 * Cerrar conversación manualmente — cualquier participante puede.
 * Sub-efectos: estado → CERRADA, cerradaAt, cerradaPorUserId. El ciclo
 * NO se incrementa al cerrar (eso pasa al reabrir).
 *
 * Idempotente: si ya está CERRADA, devuelve ok sin tocar nada.
 */
export async function cerrarConversacionAction(conversacionId: string): Promise<ActionState> {
  const session = await requirePermiso('chat');
  const userId = session.user.id;

  const part = await asegurarParticipante(userId, conversacionId);
  if (!part) return { error: 'No participas en esta conversación' };

  const conv = await prisma.conversacion.findUnique({
    where: { id: conversacionId },
    select: { estado: true },
  });
  if (!conv) return { error: 'Conversación no encontrada' };
  if (conv.estado === 'CERRADA') return { ok: true };

  await prisma.conversacion.update({
    where: { id: conversacionId },
    data: {
      estado: 'CERRADA',
      cerradaAt: new Date(),
      cerradaPorUserId: userId,
      cerradaPorInactividad: false,
    },
  });
  await publishConvUpdate(conversacionId);
  revalidatePath('/admin/chat');
  return { ok: true };
}

/**
 * Reabrir conversación cerrada — incrementa el ciclo (para que la próxima
 * calificación cuente como otra encuesta independiente). Cualquier
 * participante puede reabrir.
 */
export async function reabrirConversacionAction(conversacionId: string): Promise<ActionState> {
  const session = await requirePermiso('chat');
  const userId = session.user.id;

  const part = await asegurarParticipante(userId, conversacionId);
  if (!part) return { error: 'No participas en esta conversación' };

  const conv = await prisma.conversacion.findUnique({
    where: { id: conversacionId },
    select: { estado: true },
  });
  if (!conv) return { error: 'Conversación no encontrada' };
  if (conv.estado === 'ABIERTA') return { ok: true };

  await prisma.conversacion.update({
    where: { id: conversacionId },
    data: {
      estado: 'ABIERTA',
      cerradaAt: null,
      cerradaPorUserId: null,
      cerradaPorInactividad: false,
      ciclo: { increment: 1 },
      // Sprint Chat · fix loop reabrir+auto-cierre — resetea el reloj
      // de inactividad al instante de reabrir. Sin esto, una conv con
      // último mensaje hace >30 min se reabría y el siguiente sweep de
      // `autoCerrarInactivasAction` la volvía a cerrar al instante,
      // disparando un loop visible: modal calificación → reabrir →
      // auto-cerrar → modal de nuevo → ...
      ultimoMensajeAt: new Date(),
    },
  });
  await publishConvUpdate(conversacionId);
  revalidatePath('/admin/chat');
  return { ok: true };
}

/**
 * El aliado da una calificación al soporte recibido. Reglas:
 *   - El user debe ser participante NO-STAFF.
 *   - La conv debe haber tenido al menos un participante STAFF
 *     (calificación de chat aliado-aliado no aplica).
 *   - Puntaje 1-5.
 *   - Una calificación por (conv, user, ciclo). Si reintenta se devuelve error.
 *
 * Funciona con conv ABIERTA o CERRADA (UX permite calificar antes del
 * cierre si el aliado lo desea — más data nunca está de más).
 */
export async function calificarConversacionAction(params: {
  conversacionId: string;
  puntaje: number;
  comentario?: string;
}): Promise<ActionState> {
  const session = await requirePermiso('chat');
  const userId = session.user.id;
  const role = session.user.role;

  if (esStaff(role)) {
    return { error: 'El staff no califica conversaciones' };
  }

  const puntaje = Math.round(params.puntaje);
  if (!Number.isFinite(puntaje) || puntaje < 1 || puntaje > 5) {
    return { error: 'El puntaje debe estar entre 1 y 5' };
  }
  const comentario = (params.comentario ?? '').trim().slice(0, 1000) || null;

  const conv = await prisma.conversacion.findUnique({
    where: { id: params.conversacionId },
    select: {
      id: true,
      ciclo: true,
      participantes: {
        select: {
          userId: true,
          user: { select: { role: true } },
        },
      },
    },
  });
  if (!conv) return { error: 'Conversación no encontrada' };

  const soyParticipante = conv.participantes.some((p) => p.userId === userId);
  if (!soyParticipante) return { error: 'No participas en esta conversación' };

  const hayStaff = conv.participantes.some((p) => esStaff(p.user.role));
  if (!hayStaff) {
    return {
      error: 'Esta conversación no tiene staff — no aplica calificación',
    };
  }

  try {
    await prisma.conversacionCalificacion.create({
      data: {
        conversacionId: conv.id,
        userId,
        ciclo: conv.ciclo,
        puntaje,
        comentario,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique')) {
      return { error: 'Ya calificaste esta conversación' };
    }
    return { error: 'Error al guardar la calificación' };
  }

  revalidatePath('/admin/chat');
  revalidatePath('/admin/soporte/calificaciones-chat');
  return { ok: true };
}

/**
 * Sweep best-effort de auto-cierre: marca como CERRADA toda conversación
 * ABIERTA cuyo último mensaje sea > 30 min, con `cerradaPorInactividad
 * = true`. No requiere user — se ejecuta sin contexto de sesión.
 *
 * Se invoca desde `listarConversacionesAction` (que se llama cada 4s
 * por cliente activo). El UPDATE es barato cuando no hay candidatos
 * (índice estado+ultimoMensajeAt). Si una misma franja es pegada por
 * varios clientes al mismo tiempo, todos updean la misma fila a los
 * mismos valores — idempotente.
 */
export async function autoCerrarInactivasAction(): Promise<{ cerradas: number }> {
  const corte = new Date(Date.now() - INACTIVIDAD_MS);
  const res = await prisma.conversacion.updateMany({
    where: {
      estado: 'ABIERTA',
      ultimoMensajeAt: { lt: corte },
    },
    data: {
      estado: 'CERRADA',
      cerradaAt: new Date(),
      cerradaPorInactividad: true,
    },
  });
  return { cerradas: res.count };
}
