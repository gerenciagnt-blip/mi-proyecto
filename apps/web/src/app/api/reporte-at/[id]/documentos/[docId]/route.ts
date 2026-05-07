import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { uploadsRoot } from '@/lib/cartera/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reporte-at/[id]/documentos/[docId] — sirve un documento
 * adjunto al reporte AT. Solo staff con `soporte.reporte_at` (o ADMIN).
 * El aliado NO descarga estos archivos: son soportes operativos que
 * Soporte adjunta al gestionar el caso (FURAT, etc.).
 *
 * Política de retención: 30 días desde createdAt. Si `eliminado=true`
 * el archivo ya no existe en disco — devolvemos 410 Gone.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  await requirePermiso('soporte.reporte_at');
  const { id, docId } = await params;

  const doc = await prisma.reporteATDocumento.findUnique({
    where: { id: docId },
    select: {
      id: true,
      reporteAtId: true,
      archivoPath: true,
      archivoMime: true,
      archivoNombreOriginal: true,
      eliminado: true,
    },
  });
  if (!doc || doc.reporteAtId !== id) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
  }
  if (doc.eliminado) {
    return NextResponse.json(
      { error: 'Archivo ya fue eliminado por retención (30 días).' },
      { status: 410 },
    );
  }

  // Path sanitization defensiva.
  if (doc.archivoPath.includes('..')) {
    return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 });
  }
  const root = uploadsRoot();
  const abs = resolve(join(root, doc.archivoPath));
  if (!abs.startsWith(root)) {
    return NextResponse.json({ error: 'Ruta fuera del raíz' }, { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = await readFile(abs);
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado en disco' }, { status: 404 });
  }

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': doc.archivoMime,
      'Content-Disposition': `attachment; filename="${doc.archivoNombreOriginal.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
