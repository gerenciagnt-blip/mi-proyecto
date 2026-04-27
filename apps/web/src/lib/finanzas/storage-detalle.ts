/**
 * Sprint Soporte reorg — Storage helper para soportes de pago de detalle
 * de movimiento. Sigue el mismo patrón que `lib/soporte-af/storage.ts`:
 * delega a `cartera/storage.ts` (que ya tiene el writeFile + sha256 +
 * directorio `UPLOADS_DIR`).
 *
 * Carpeta destino: `mov-detalle/<detalleId>/...` para que el cron de
 * limpieza pueda barrer por carpeta cuando se elimine el detalle.
 */

import { guardarArchivo } from '../cartera/storage';

/** MIMEs aceptados para soporte de pago de un detalle. */
export const MIMES_PERMITIDOS_DETALLE = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

/** Peso máximo (5 MB). */
export const TAMANO_MAX_DETALLE = 5 * 1024 * 1024;

/**
 * Guarda el soporte de pago organizado por detalleId.
 */
export async function guardarSoporteDetalle(
  buf: Buffer,
  originalName: string,
  detalleId: string,
): Promise<{ path: string; hash: string; size: number }> {
  return guardarArchivo(buf, originalName, `mov-detalle/${detalleId}`);
}
