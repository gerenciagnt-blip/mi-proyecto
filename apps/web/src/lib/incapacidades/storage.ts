/**
 * Storage de adjuntos de incapacidades. Reutiliza el storage genérico
 * de cartera pero organiza los archivos por incapacidadId para que se
 * puedan ubicar fácilmente al aplicar la retención de 120 días.
 */

import { guardarArchivo } from '../cartera/storage';

/** MIMEs aceptados en adjuntos de incapacidad. */
export const MIMES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

/** Peso máximo por archivo en bytes (5 MB). */
export const TAMANO_MAX = 5 * 1024 * 1024;

export async function guardarDocumentoIncapacidad(
  buf: Buffer,
  originalName: string,
  incapacidadId: string,
): Promise<{ path: string; hash: string; size: number }> {
  // Prefijo: incapacidades/<id> para que todos los docs de una incapacidad
  // queden juntos y el job de retención pueda borrarlos con un solo rm -rf.
  return guardarArchivo(buf, originalName, `incapacidades/${incapacidadId}`);
}
