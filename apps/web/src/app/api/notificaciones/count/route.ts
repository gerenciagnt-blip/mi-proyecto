import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { contarNoLeidas } from '@/lib/notificaciones';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notificaciones/count — devuelve solo el conteo de no leídas.
 * Endpoint liviano para el polling del badge de la campana (cada 60s).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ count: 0 });
  }
  const count = await contarNoLeidas(
    session.user.id,
    session.user.role,
    session.user.sucursalId ?? null,
  );
  return NextResponse.json({ count });
}
