/**
 * Storage de adjuntos de reporte AT (FURAT y otros). Reutiliza el helper
 * genérico `guardarArchivo` del módulo cartera y agrupa los archivos
 * por reporteAtId para que el job de retención (30 días) pueda
 * eliminarlos como un set coherente.
 */

import { guardarArchivo } from '../cartera/storage';

/** MIMEs aceptados — PDF + imágenes (la ARL puede emitir cualquiera). */
export const MIMES_PERMITIDOS_REPORTE_AT = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

/** Peso máximo por archivo (5 MB) — alineado con el resto de módulos. */
export const TAMANO_MAX_REPORTE_AT = 5 * 1024 * 1024;

export async function guardarDocumentoReporteAt(
  buf: Buffer,
  originalName: string,
  reporteAtId: string,
): Promise<{ path: string; hash: string; size: number }> {
  return guardarArchivo(buf, originalName, `reporte-at/${reporteAtId}`);
}
