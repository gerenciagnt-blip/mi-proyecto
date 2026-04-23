import { guardarArchivo } from '../cartera/storage';

/** MIMEs aceptados en adjuntos de Soporte · Afiliaciones. */
export const MIMES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

/** Peso máximo por archivo en bytes (5 MB). */
export const TAMANO_MAX = 5 * 1024 * 1024;

/**
 * Guarda un adjunto de Soporte · Afiliaciones organizado por soporteAfId
 * para que la retención 120d pueda barrer toda la carpeta de una vez.
 */
export async function guardarDocumentoSoporteAf(
  buf: Buffer,
  originalName: string,
  soporteAfId: string,
): Promise<{ path: string; hash: string; size: number }> {
  return guardarArchivo(buf, originalName, `soporte-af/${soporteAfId}`);
}
