import { guardarArchivo } from '../cartera/storage';

/**
 * Sprint Chat interno · adjuntos — solo imágenes en v1 (los archivos
 * arbitrarios — PDF, docs — los manejamos en módulos especializados,
 * el chat no es un drive). Si se necesita más adelante, se amplía
 * la lista aquí.
 */
export const MIMES_PERMITIDOS_CHAT = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Peso máximo por archivo (5 MB) — igual que el resto de módulos. */
export const TAMANO_MAX_CHAT = 5 * 1024 * 1024;

/** Cantidad máxima de adjuntos por mensaje. */
export const MAX_ADJUNTOS_POR_MENSAJE = 6;

/**
 * Guarda un adjunto del chat organizado por conversacionId. La carpeta
 * coincide con el lifecycle de la conversación: si se borra la conv,
 * sus adjuntos se pueden barrer en una sola pasada.
 */
export async function guardarAdjuntoChat(
  buf: Buffer,
  originalName: string,
  conversacionId: string,
): Promise<{ path: string; hash: string; size: number }> {
  return guardarArchivo(buf, originalName, `chat/${conversacionId}`);
}
