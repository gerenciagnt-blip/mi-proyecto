import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { marcarTodasLeidas } from '@/lib/notificaciones';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notificaciones/leer-todas — marca todas las notificaciones
 * visibles del usuario como leídas. Útil para el botón "limpiar" del
 * dropdown.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const count = await marcarTodasLeidas(
    session.user.id,
    session.user.role,
    session.user.sucursalId ?? null,
  );
  return NextResponse.json({ ok: true, count });
}
