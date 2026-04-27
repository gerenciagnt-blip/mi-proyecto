import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { uploadsRoot } from '@/lib/cartera/storage';

export const dynamic = 'force-dynamic';

/**
 * Sprint Soporte reorg — GET soporte de pago de un detalle de
 * movimiento. Solo STAFF (módulo de finanzas no es accesible a aliados).
 *
 * Path sanitization contra traversal. Si el archivo no existe en disco
 * (por una limpieza manual / retención futura) devuelve 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  await requireStaff();
  const { id, docId } = await params;

  const doc = await prisma.movimientoDetalleDocumento.findUnique({
    where: { id: docId },
    select: {
      id: true,
      detalleId: true,
      archivoPath: true,
      archivoMime: true,
      archivoNombreOriginal: true,
    },
  });
  if (!doc || doc.detalleId !== id) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
  }

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
