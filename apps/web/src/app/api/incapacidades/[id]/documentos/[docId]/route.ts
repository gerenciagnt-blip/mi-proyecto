import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { uploadsRoot } from '@/lib/cartera/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/incapacidades/[id]/documentos/[docId] — sirve un documento
 * adjunto. Valida:
 *   - Scope: SUCURSAL sólo puede descargar documentos de su sucursal.
 *   - Que el documento no esté marcado como eliminado (retención 120 días).
 *   - Path sanitization contra traversal.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  await requireAdmin();
  const { id, docId } = await params;

  const doc = await prisma.incapacidadDocumento.findUnique({
    where: { id: docId },
    select: {
      id: true,
      incapacidadId: true,
      archivoPath: true,
      archivoMime: true,
      archivoNombreOriginal: true,
      eliminado: true,
      incapacidad: { select: { sucursalId: true } },
    },
  });
  if (!doc || doc.incapacidadId !== id) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
  }
  if (doc.eliminado) {
    return NextResponse.json(
      { error: 'Archivo ya fue eliminado por retención (120 días).' },
      { status: 410 },
    );
  }

  // Scope: aliado sólo sus documentos.
  const scope = await getUserScope();
  if (!scope) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
  }
  if (scope.tipo === 'SUCURSAL' && doc.incapacidad.sucursalId !== scope.sucursalId) {
    return NextResponse.json(
      { error: 'Sin permiso sobre este documento' },
      { status: 403 },
    );
  }

  // Path sanitization.
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
    return NextResponse.json(
      { error: 'Archivo no encontrado en disco' },
      { status: 404 },
    );
  }

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': doc.archivoMime,
      'Content-Disposition': `attachment; filename="${doc.archivoNombreOriginal.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
