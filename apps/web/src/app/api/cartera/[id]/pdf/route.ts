import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { uploadsRoot } from '@/lib/cartera/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cartera/[id]/pdf — descarga el PDF original guardado al
 * importar el consolidado.
 *
 * Sprint Soporte reorg fase 2 — antes era staff-only; ahora también el
 * aliado puede descargarlo si tiene **al menos una línea** del
 * consolidado asignada a su sucursal (scope SUCURSAL). El staff
 * (ADMIN/SOPORTE) siempre puede.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const scope = await getUserScope();
  if (!scope) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
  }
  const { id } = await params;

  const cons = await prisma.carteraConsolidado.findUnique({
    where: { id },
    select: {
      consecutivo: true,
      archivoOrigenPath: true,
      archivoOrigenHash: true,
    },
  });
  if (!cons || !cons.archivoOrigenPath) {
    return NextResponse.json({ error: 'PDF no disponible para este consolidado' }, { status: 404 });
  }

  // Scope: si es SUCURSAL, validar que tenga al menos una línea del
  // consolidado asignada a su sucursal. Si no, 403.
  if (scope.tipo === 'SUCURSAL') {
    const tieneLinea = await prisma.carteraDetallado.findFirst({
      where: { consolidadoId: id, sucursalAsignadaId: scope.sucursalId },
      select: { id: true },
    });
    if (!tieneLinea) {
      return NextResponse.json({ error: 'Sin permiso sobre este consolidado' }, { status: 403 });
    }
  }

  // Resolución segura: impide path traversal al rechazar ".." y verificar
  // que la ruta resuelta siga dentro de uploadsRoot().
  if (cons.archivoOrigenPath.includes('..')) {
    return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 });
  }
  const root = uploadsRoot();
  const abs = resolve(join(root, cons.archivoOrigenPath));
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
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${cons.consecutivo}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
