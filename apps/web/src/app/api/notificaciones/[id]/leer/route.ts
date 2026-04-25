import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { marcarLeida } from '@/lib/notificaciones';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notificaciones/[id]/leer — marca una notificación como leída
 * para el usuario autenticado. La validación de "es destinatario" la hace
 * `marcarLeida()` server-side.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const { id } = await params;
  await marcarLeida(id, session.user.id);
  return NextResponse.json({ ok: true });
}
