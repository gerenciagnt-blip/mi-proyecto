/**
 * Storage local para archivos de cartera (PDFs originales + incapacidades
 * más adelante). Los archivos se guardan bajo UPLOADS_DIR (env var con
 * default `./uploads/`) organizados por fecha y tipo.
 *
 * Cuando migremos a S3/R2 reemplazamos este módulo sin tocar el caller.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Raíz configurable. Default relativa al cwd del servidor Next. */
export function uploadsRoot(): string {
  return resolve(process.env.UPLOADS_DIR ?? './uploads');
}

/** Calcula el sha-256 hexadecimal de un buffer (para trazabilidad). */
export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Guarda el PDF de cartera y devuelve la ruta relativa a uploadsRoot()
 * más el hash del archivo. Estructura:
 *
 *   uploads/cartera/YYYY-MM/<hash12>-<filename>.pdf
 */
export async function guardarPdfCartera(
  pdf: Buffer,
  originalName: string,
): Promise<{ path: string; hash: string; size: number }> {
  return guardarArchivo(pdf, originalName, 'cartera');
}

/**
 * Storage genérico para otros módulos (incapacidades, etc.). `prefix` es
 * la raíz bajo UPLOADS_DIR (ej. "incapacidades/abc123" para agrupar docs
 * de una radicación).
 */
export async function guardarArchivo(
  buf: Buffer,
  originalName: string,
  prefix: string,
): Promise<{ path: string; hash: string; size: number }> {
  const hash = sha256(buf);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const relDir = join(prefix, ym);
  const absDir = join(uploadsRoot(), relDir);
  await mkdir(absDir, { recursive: true });

  // Sanitiza el nombre: solo ASCII seguros, sin espacios; preserva extensión.
  const safe = originalName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '_')
    .slice(0, 80);
  const filename = `${hash.slice(0, 12)}-${safe}`;
  const absPath = join(absDir, filename);
  await writeFile(absPath, buf);

  const relPath = join(relDir, filename).replace(/\\/g, '/');
  return { path: relPath, hash, size: buf.byteLength };
}
