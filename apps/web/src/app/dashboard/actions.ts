'use server';

import { prisma } from '@pila/db';
import { auth, signOut } from '@/auth';

/**
 * Logout con limpieza de presencia. Antes de invalidar la sesión,
 * borramos `lastActiveAt` del user — así el chat lo ve offline al
 * instante, sin esperar el umbral de 2 min sin heartbeat.
 *
 * Si el borrado falla (BD caída, race) seguimos con el signOut igual:
 * la prioridad es cerrar la sesión, no la limpieza.
 */
export async function logoutAction() {
  try {
    const session = await auth();
    if (session?.user?.id) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { lastActiveAt: null },
      });
    }
  } catch {
    // best-effort
  }
  await signOut({ redirectTo: '/login' });
}
