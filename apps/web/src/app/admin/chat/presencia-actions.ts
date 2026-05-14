'use server';

import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { whereUsuariosElegibles } from '@/lib/chat/elegibles';

/**
 * Sprint Chat interno · presencia — heartbeat del cliente.
 *
 * Se invoca cada ~60s desde el componente `<PresenciaHeartbeat />` montado
 * en el layout admin. Solo actualiza el timestamp; no devuelve data.
 *
 * Idempotente y barato: 1 UPDATE por user activo cada minuto.
 */
export async function heartbeatAction(): Promise<{ ok: true } | { ok: false }> {
  const session = await requireAuth();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastActiveAt: new Date() },
  });
  return { ok: true };
}

const ONLINE_VENTANA_MS = 2 * 60 * 1000; // 2 min

export type UsuarioOnline = {
  id: string;
  name: string;
  email: string;
  role: string;
  sucursalCodigo: string | null;
  lastActiveAt: string;
};

/**
 * Lista usuarios online dentro del set elegible del actor. Se considera
 * online si `lastActiveAt > now - 2 min`. Se ordena alfabéticamente.
 *
 * Polling de 15s desde el widget — barato porque el set elegible suele
 * ser chico (<100 users) y el filtro por timestamp golpea el índice
 * `lastActiveAt`.
 */
export async function listarUsuariosOnlineAction(): Promise<
  { ok: true; items: UsuarioOnline[] } | { ok: false; error: string }
> {
  const session = await requireAuth();
  const actor = {
    userId: session.user.id,
    role: session.user.role,
    sucursalId: session.user.sucursalId,
  };

  const baseWhere = whereUsuariosElegibles(actor);
  const corte = new Date(Date.now() - ONLINE_VENTANA_MS);

  const users = await prisma.user.findMany({
    where: {
      ...baseWhere,
      lastActiveAt: { gte: corte },
    },
    orderBy: [{ name: 'asc' }],
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      lastActiveAt: true,
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
      // lastActiveAt nunca es null acá por el filtro `gte`; aserto.
      lastActiveAt: u.lastActiveAt!.toISOString(),
    })),
  };
}
