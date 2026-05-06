import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { usuarioPuedeVerAfiliacion } from '@/lib/colpatria/certificados';

export const dynamic = 'force-dynamic';

/**
 * Sprint 8.6 — Status de un job de certificado.
 *
 * El cliente (modal con spinner) hace polling cada ~3s hasta que el
 * status sea SUCCESS o FAILED. Cuando es SUCCESS y `entregadoAt` está
 * vacío, el PDF está listo para descargarse desde
 * `/api/colpatria/certificados/[id]/pdf`.
 *
 * Respuesta:
 *   200 — { id, status, error?, ready: boolean, entregado: boolean }
 *   403 — usuario sin acceso a la afiliación
 *   404 — job no existe
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;

  const job = await prisma.colpatriaCertificadoJob.findUnique({
    where: { id },
    select: {
      id: true,
      afiliacionId: true,
      status: true,
      error: true,
      entregadoAt: true,
    },
  });
  if (!job) {
    return NextResponse.json({ error: 'Job no encontrado' }, { status: 404 });
  }

  const tieneAcceso = await usuarioPuedeVerAfiliacion(job.afiliacionId, {
    role: session.user.role,
    sucursalId: session.user.sucursalId,
  });
  if (!tieneAcceso) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    error: job.error,
    ready: job.status === 'SUCCESS' && job.entregadoAt === null,
    entregado: job.entregadoAt !== null,
  });
}
