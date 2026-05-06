import { readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { usuarioPuedeVerAfiliacion } from '@/lib/colpatria/certificados';
import { uploadsRoot } from '@/lib/cartera/storage';

export const dynamic = 'force-dynamic';

/**
 * Sprint 8.6 — Descarga del certificado de afiliación vigente.
 *
 * Al servir el PDF:
 *   1. Verifica permisos (sucursal scoping para aliados, todo para staff).
 *   2. Lee el archivo del filesystem.
 *   3. Lo entrega al cliente con `Content-Disposition: attachment`.
 *   4. Borra el archivo del disco.
 *   5. Marca `entregadoAt` y limpia `pdfPath` en BD.
 *
 * El job queda como evidencia (status=SUCCESS, entregadoAt=now), pero
 * sin archivo. Si alguien vuelve a pedir el certificado, se crea un
 * job nuevo.
 *
 * Respuestas:
 *   200 — PDF binario
 *   403 — sin acceso
 *   404 — job no existe / sin pdfPath / archivo borrado
 *   409 — el PDF ya fue entregado (pedir uno nuevo)
 *   425 — el job aún no terminó (status != SUCCESS)
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
      pdfPath: true,
      entregadoAt: true,
      afiliacion: {
        select: { cotizante: { select: { numeroDocumento: true } } },
      },
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

  if (job.entregadoAt) {
    return NextResponse.json(
      { error: 'Certificado ya entregado — solicitar uno nuevo' },
      { status: 409 },
    );
  }
  if (job.status !== 'SUCCESS' || !job.pdfPath) {
    return NextResponse.json(
      { error: `El job aún no terminó (status=${job.status})` },
      { status: 425 },
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
    // El archivo no está pero el job dice SUCCESS — alguien lo borró
    // antes de tiempo o el bot se descontroló. Marcamos como entregado
    // para que el usuario pida uno nuevo.
    await prisma.colpatriaCertificadoJob.update({
      where: { id },
      data: { entregadoAt: new Date(), pdfPath: null },
    });
    return NextResponse.json({ error: 'Archivo no encontrado en disco' }, { status: 404 });
  }

  // Borrar primero el archivo físico, después marcar entregadoAt en BD.
  // Si el unlink falla, dejamos un registro pero el usuario igual recibe
  // el PDF (más vale entregar y limpiar después que perder la entrega).
  try {
    await unlink(abs);
  } catch {
    // Best effort — el archivo puede haber sido borrado por otro proceso
    // (refresh accidental, race). No bloquea la respuesta.
  }
  await prisma.colpatriaCertificadoJob.update({
    where: { id },
    data: { entregadoAt: new Date(), pdfPath: null },
  });

  const doc = job.afiliacion?.cotizante?.numeroDocumento ?? id.slice(-8);
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificado-arl-${doc}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
