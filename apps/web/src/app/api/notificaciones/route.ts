import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listarRecientes, contarNoLeidas } from '@/lib/notificaciones';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notificaciones — devuelve las últimas N notificaciones del
 * usuario y el conteo de no leídas. La campana llama esto cuando el
 * dropdown se abre.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ items: [], count: 0 });
  }
  const [items, count] = await Promise.all([
    listarRecientes(session.user.id, session.user.role, session.user.sucursalId ?? null, 20),
    contarNoLeidas(session.user.id, session.user.role, session.user.sucursalId ?? null),
  ]);
  return NextResponse.json({
    items: items.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      mensaje: n.mensaje,
      href: n.href,
      createdAt: n.createdAt.toISOString(),
      leida: n.leida,
    })),
    count,
  });
}
