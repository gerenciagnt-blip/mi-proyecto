import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireRole } from '@/lib/auth-helpers';
import { uploadsRoot } from '@/lib/cartera/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/colpatria/jobs/[id]/pdf — descarga el comprobante de
 * afiliación que el bot capturó tras un submit exitoso al portal AXA.
 *
 * Solo STAFF (ADMIN/SOPORTE). El aliado_owner no ve esta sección.
 *
 * El path relativo viene de `ColpatriaAfiliacionJob.pdfPath` y se
 * resuelve contra `uploadsRoot()` (mismo root que cartera/incapacidades).
 * Hay validación anti-path-traversal por seguridad.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole('ADMIN', 'SOPORTE');
  const { id } = await params;

  const job = await prisma.colpatriaAfiliacionJob.findUnique({
    where: { id },
    select: {
      pdfPath: true,
      pdfArchivedAt: true,
      afiliacion: {
        select: {
          cotizante: { select: { numeroDocumento: true } },
        },
      },
    },
  });
  if (!job || !job.pdfPath) {
    return NextResponse.json({ error: 'PDF no disponible para este job' }, { status: 404 });
  }
  // Sprint 8.5.C — política de retención. Si el archivo ya fue
  // borrado por el cron de limpieza, conservamos la evidencia en BD
  // pero respondemos 410 Gone con info de cuándo se archivó.
  if (job.pdfArchivedAt) {
    return NextResponse.json(
      {
        error: 'PDF archivado por política de retención',
        archivedAt: job.pdfArchivedAt.toISOString(),
      },
      { status: 410 },
    );
  }

  // Path traversal guard
  if (job.pdfPath.includes('..')) {
    return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 });
  }
  const root = uploadsRoot();
  const abs = resolve(join(root, job.pdfPath));
  if (!abs.startsWith(root)) {
    return NextResponse.json({ error: 'Ruta fuera del raíz' }, { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = await readFile(abs);
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado en disco' }, { status: 404 });
  }

  // Nombre amigable usando el documento del cotizante
  const doc = job.afiliacion?.cotizante?.numeroDocumento ?? id.slice(-8);
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="comprobante-colpatria-${doc}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
