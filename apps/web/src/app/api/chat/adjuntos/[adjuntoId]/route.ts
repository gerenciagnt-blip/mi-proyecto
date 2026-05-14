import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { uploadsRoot } from '@/lib/cartera/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/adjuntos/[adjuntoId]
 *
 * Sirve el binario de un adjunto del chat. Reglas:
 *   - Requiere sesión válida.
 *   - El user actual debe ser participante de la conversación a la que
 *     pertenece el mensaje del adjunto. Caso contrario → 403.
 *   - Si el adjunto está soft-deleted (`eliminado != null`) → 410 Gone.
 *
 * Devuelve `Content-Disposition: inline` para que las imágenes se rendereen
 * en el panel del chat sin forzar download (al ser solo imágenes en v1).
 *
 * Path-traversal protegido: rechaza `..` y verifica que el path resuelto
 * permanezca dentro de `uploadsRoot()`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ adjuntoId: string }> }) {
  const session = await requireAuth();
  const { adjuntoId } = await params;

  const adj = await prisma.mensajeAdjunto.findUnique({
    where: { id: adjuntoId },
    select: {
      archivoPath: true,
      archivoMime: true,
      archivoNombre: true,
      eliminado: true,
      mensaje: {
        select: {
          conversacionId: true,
        },
      },
    },
  });
  if (!adj) {
    return NextResponse.json({ error: 'Adjunto no encontrado' }, { status: 404 });
  }
  if (adj.eliminado) {
    return NextResponse.json({ error: 'Adjunto eliminado' }, { status: 410 });
  }

  // Guard: ¿el user actual participa en la conversación del mensaje?
  const part = await prisma.conversacionParticipante.findUnique({
    where: {
      conversacionId_userId: {
        conversacionId: adj.mensaje.conversacionId,
        userId: session.user.id,
      },
    },
    select: { conversacionId: true },
  });
  if (!part) {
    return NextResponse.json({ error: 'Sin permiso sobre esta conversación' }, { status: 403 });
  }

  // Path-traversal protection
  if (adj.archivoPath.includes('..')) {
    return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 });
  }
  const root = uploadsRoot();
  const abs = resolve(join(root, adj.archivoPath));
  if (!abs.startsWith(root)) {
    return NextResponse.json({ error: 'Ruta fuera del raíz' }, { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = await readFile(abs);
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado en disco' }, { status: 404 });
  }

  // Nombre seguro para Content-Disposition (RFC 6266 mínimo).
  const nombreSafe = adj.archivoNombre.replace(/["\\]/g, '_');

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': adj.archivoMime,
      'Content-Disposition': `inline; filename="${nombreSafe}"`,
      // Adjuntos son inmutables (no se editan, solo soft-delete) — podemos
      // dejar que el navegador cachee. 1 hora es prudente: si el archivo
      // se borra el endpoint devuelve 410 y rompe la caché.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
