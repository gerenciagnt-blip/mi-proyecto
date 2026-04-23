import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { uploadsRoot } from '@/lib/cartera/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cartera/[id]/pdf — descarga el PDF original guardado al
 * importar el consolidado. Sólo staff (ADMIN/SOPORTE) puede descargar —
 * el aliado no necesita el PDF (ve el detallado parseado).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireStaff();
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
    return NextResponse.json(
      { error: 'PDF no disponible para este consolidado' },
      { status: 404 },
    );
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
