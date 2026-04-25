/**
 * Labels y tonalidades para los estados de cartera. Se mantiene un único
 * enum `CarteraEstado` para consolidado y línea, pero los valores tienen
 * significado distinto según el contexto:
 *
 *   Consolidado (lote enviado a la entidad):
 *     - EN_CONCILIACION → "En proceso"   (recién cargado, soporte revisa)
 *     - ENVIADA         → "Enviada"      (soporte respondió a la entidad)
 *     - CONCILIADA      → "Conciliada"   (cerrado con la entidad)
 *
 *   Línea (cotizante × período):
 *     - EN_CONCILIACION → "En conciliación"  (en estudio)
 *     - CONCILIADA       → "Conciliada"      (descartada / aclarada)
 *     - MORA_REAL        → "Mora real"       (visible al aliado)
 *     - CARTERA_REAL     → "Cartera real"    (visible al aliado)
 *     - PAGADA_CARTERA_REAL → "Pagada"       (el aliado pagó)
 *
 * Los estados que no aplican a un contexto siguen funcionando — solo no
 * deberían ocurrir en ese campo. Tener un enum compartido simplifica la
 * bitácora de gestiones que registra `nuevoEstado` independiente del
 * objeto.
 */

import type { CarteraEstado } from '@pila/db';

export const ESTADO_CONSOLIDADO_LABEL: Record<CarteraEstado, string> = {
  EN_CONCILIACION: 'En proceso',
  ENVIADA: 'Enviada',
  CONCILIADA: 'Conciliada',
  MORA_REAL: 'Mora real',
  CARTERA_REAL: 'Cartera real',
  PAGADA_CARTERA_REAL: 'Pagada',
};

export const ESTADO_LINEA_LABEL: Record<CarteraEstado, string> = {
  EN_CONCILIACION: 'En conciliación',
  ENVIADA: 'Enviada',
  CONCILIADA: 'Conciliada',
  MORA_REAL: 'Mora real',
  CARTERA_REAL: 'Cartera real',
  PAGADA_CARTERA_REAL: 'Pagada',
};

/** Clases tailwind para el chip de estado (ring + bg + text). */
export const ESTADO_TONE: Record<CarteraEstado, string> = {
  EN_CONCILIACION: 'bg-amber-50 text-amber-700 ring-amber-200',
  ENVIADA: 'bg-sky-50 text-sky-700 ring-sky-200',
  CONCILIADA: 'bg-slate-100 text-slate-700 ring-slate-300',
  MORA_REAL: 'bg-orange-50 text-orange-700 ring-orange-200',
  CARTERA_REAL: 'bg-violet-50 text-violet-700 ring-violet-200',
  PAGADA_CARTERA_REAL: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

/**
 * Estados que disparan visibilidad de la línea en el módulo Administrativo
 * del aliado: tanto MORA_REAL como CARTERA_REAL (más PAGADA_CARTERA_REAL
 * para historial de pagos hechos).
 */
export const ESTADOS_VISIBLE_ALIADO: CarteraEstado[] = [
  'MORA_REAL',
  'CARTERA_REAL',
  'PAGADA_CARTERA_REAL',
];
