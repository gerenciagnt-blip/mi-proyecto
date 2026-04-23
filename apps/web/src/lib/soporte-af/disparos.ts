import type { SoporteAfTipoDisparo } from '@pila/db';

/**
 * Datos mínimos de una afiliación para detectar disparos. Todos los IDs
 * vienen como string para comparación directa; fechaIngreso como ISO date.
 */
export type AfiliacionSnapshot = {
  estado: 'ACTIVA' | 'INACTIVA';
  fechaIngreso: string; // YYYY-MM-DD
  empresaId: string | null;
  nivelRiesgo: string;
  planSgssId: string | null;
};

/**
 * Calcula qué disparos de Soporte aplican según la transición de una
 * afiliación. Retorna un arreglo (posiblemente vacío — en cuyo caso NO
 * se crea solicitud).
 *
 * Regla global (confirmada con el usuario): solo se dispara si el estado
 * *final* es ACTIVA. Si la afiliación queda INACTIVA, no hay interacción
 * de soporte.
 *
 * Casos:
 * - CREATE con estado ACTIVA → ['NUEVA']
 * - CREATE con estado INACTIVA → [] (no dispara)
 * - UPDATE donde queda INACTIVA → [] (no dispara, aunque cambien campos)
 * - UPDATE INACTIVA → ACTIVA → ['REACTIVACION', ...otros cambios]
 * - UPDATE ACTIVA → ACTIVA con cambios en: fechaIngreso / empresaId /
 *   nivelRiesgo / planSgssId → los disparos correspondientes.
 */
export function detectarDisparos(
  antes: AfiliacionSnapshot | null,
  despues: AfiliacionSnapshot,
): SoporteAfTipoDisparo[] {
  // El estado final debe ser ACTIVA para disparar.
  if (despues.estado !== 'ACTIVA') return [];

  // Caso CREATE.
  if (antes === null) {
    return ['NUEVA'];
  }

  const disparos: SoporteAfTipoDisparo[] = [];

  // Reactivación: INACTIVA → ACTIVA.
  if (antes.estado === 'INACTIVA') {
    disparos.push('REACTIVACION');
  }

  // Cambios en campos monitoreados.
  if (antes.fechaIngreso !== despues.fechaIngreso) {
    disparos.push('CAMBIO_FECHA_INGRESO');
  }
  if (antes.empresaId !== despues.empresaId) {
    disparos.push('CAMBIO_EMPRESA');
  }
  if (antes.nivelRiesgo !== despues.nivelRiesgo) {
    disparos.push('CAMBIO_NIVEL_ARL');
  }
  if (antes.planSgssId !== despues.planSgssId) {
    disparos.push('CAMBIO_PLAN_SGSS');
  }

  return disparos;
}
