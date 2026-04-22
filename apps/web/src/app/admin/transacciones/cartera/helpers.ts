/**
 * Helpers síncronos — NO viven en el archivo de server actions porque
 * Next.js exige que todo export en un archivo con 'use server' sea async.
 */

/**
 * ¿Se puede cerrar el período?
 * Regla: se habilita faltando 8 días o menos para el fin del mes del período.
 */
export function puedeCerrarPeriodo(periodo: {
  anio: number;
  mes: number;
}): boolean {
  const hoy = new Date();
  // Último día del mes del período (day=0 del mes siguiente)
  const ultimo = new Date(periodo.anio, periodo.mes, 0);
  const diffMs = ultimo.getTime() - hoy.getTime();
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDias <= 8;
}
