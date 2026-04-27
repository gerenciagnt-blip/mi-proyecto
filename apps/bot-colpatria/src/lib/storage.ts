/**
 * Storage del bot Colpatria — guarda los PDFs de comprobante de
 * afiliación que el portal AXA devuelve tras un submit exitoso.
 *
 * Reusa la misma raíz `UPLOADS_DIR` que el web app, así el endpoint
 * `/api/colpatria/jobs/[id]/pdf` (Next.js) puede leer los archivos
 * sin storage compartido extra. En dev local default `./uploads/`,
 * en DigitalOcean apunta a un volumen montado.
 *
 * Estructura: `<UPLOADS_DIR>/colpatria/<empresaId>/<YYYY-MM>/<jobId>-<hash12>.pdf`
 *
 * Cuando migremos a S3/R2 reemplazamos solo este módulo.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

function uploadsRoot(): string {
  // Si el bot corre en GH Actions / DigitalOcean, UPLOADS_DIR debe
  // apuntar al mismo path que monta el web app. En local, por default
  // `./uploads/` resuelve relativo al cwd del proceso (raíz del repo
  // cuando se invoca con `pnpm bot-colpatria ...`).
  return resolve(process.env.UPLOADS_DIR ?? './uploads');
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Guarda el PDF del comprobante AXA y devuelve la ruta relativa al
 * UPLOADS_DIR (lo que se persiste en `ColpatriaAfiliacionJob.pdfPath`).
 *
 * Path relativo: `colpatria/<empresaId>/<YYYY-MM>/<jobId>-<hash12>.pdf`
 *
 * El `jobId` en el filename garantiza unicidad incluso si el mismo
 * empleado se reintenta varias veces. El `hash12` es para detectar
 * duplicados o corrupciones (mismo PDF re-guardado da mismo hash).
 */
export async function guardarPdfComprobante(
  pdf: Buffer,
  empresaId: string,
  jobId: string,
): Promise<{ path: string; hash: string; size: number }> {
  if (pdf.byteLength === 0) {
    throw new Error('PDF vacío — se rechaza para no guardar artefacto inútil');
  }

  const hash = sha256(pdf);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const relDir = join('colpatria', empresaId, ym);
  const absDir = join(uploadsRoot(), relDir);
  await mkdir(absDir, { recursive: true });

  const filename = `${jobId}-${hash.slice(0, 12)}.pdf`;
  const absPath = join(absDir, filename);
  await writeFile(absPath, pdf);

  // Path relativo SIEMPRE con `/` (compat Windows ↔ Linux), porque
  // este string viaja a BD y se concatena después con uploadsRoot()
  // en la API de Next.
  const relPath = join(relDir, filename).replace(/\\/g, '/');
  return { path: relPath, hash, size: pdf.byteLength };
}
