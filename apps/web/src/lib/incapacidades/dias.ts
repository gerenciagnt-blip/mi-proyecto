/**
 * Cálculo de "días desde radicación" para incapacidades.
 *
 * Diferencia clave vs cartera:
 *   - Cartera: cuenta desde la última gestión (cualquier movimiento
 *     resetea el contador).
 *   - Incapacidades: cuenta desde la FECHA DE RADICACIÓN. El contador
 *     SIGUE CORRIENDO con cada gestión interna y solo SE DETIENE cuando
 *     el proceso se cierra (estado PAGADA o RECHAZADA).
 *
 * Justificación de negocio: el aliado cobra/recibe la incapacidad; lo
 * que importa es cuánto tiempo lleva el caso TOTAL desde que él lo
 * radicó hasta que la entidad responde, no cuántas notas internas se
 * pusieron en el medio.
 */

import type { IncapacidadEstado } from '@pila/db';
import { clasificarUrgencia, diasEntre, type UrgenciaGestion } from '@/lib/cartera/labels';

/** Estados terminales: el proceso está cerrado, el contador se detiene. */
export const ESTADOS_CIERRE: IncapacidadEstado[] = ['PAGADA', 'RECHAZADA'];

export function estaCerrada(estado: IncapacidadEstado): boolean {
  return ESTADOS_CIERRE.includes(estado);
}

export type DiasIncapacidadInfo = {
  /** Cantidad de días corridos. */
  dias: number;
  /** True si el proceso ya cerró (PAGADA / RECHAZADA). */
  cerrada: boolean;
  /** Urgencia (mismo sistema visual que cartera). Solo aplica en activas. */
  urgencia: UrgenciaGestion;
};

/**
 * Calcula los días que ha tomado la incapacidad.
 *   - Si está activa: días desde radicación hasta hoy.
 *   - Si está cerrada: días desde radicación hasta `fechaCierre` (o
 *     hasta hoy si no se proveyó — fallback defensivo).
 *
 * `fechaCierre` se deriva normalmente del `createdAt` de la última
 * gestión cuyo `nuevoEstado` fue PAGADA o RECHAZADA.
 */
export function diasIncapacidad(args: {
  fechaRadicacion: Date;
  estado: IncapacidadEstado;
  fechaCierre?: Date | null;
}): DiasIncapacidadInfo {
  const cerrada = estaCerrada(args.estado);
  const hasta = cerrada ? (args.fechaCierre ?? new Date()) : new Date();
  const dias = diasEntre(args.fechaRadicacion, hasta);
  return {
    dias,
    cerrada,
    urgencia: clasificarUrgencia(dias),
  };
}
