import { calcularDiff, type Diff } from './diff';

/**
 * Lógica pura del wrapper de bitácora — separada en su propio archivo
 * para que pueda testearse sin arrastrar el chain de next-auth.
 *
 * El wrapper público (`with-audit.ts`) usa esta función y luego delega
 * a `registrarAuditoria()` la persistencia. Aquí solo decidimos:
 *   - Qué campos descartar (defensa contra dejar passwordHash en logs).
 *   - Si la acción merece registrarse (UPDATE sin cambios → null).
 *   - Cuál es la descripción por defecto.
 */

export type AuditoriaOpts = {
  /** Modelo afectado, ej. "Cotizante", "Empresa", "Planilla". */
  entidad: string;
  /** Id de la fila afectada. */
  entidadId: string;
  /** Sucursal a la que pertenece la entidad (si aplica). Sirve para
   *  scope del aliado_owner. Null si la entidad es global. */
  entidadSucursalId?: string | null;
  /** Resumen humano corto para mostrar en la lista. Si se omite, se
   *  arma uno por defecto a partir de entidad y acción. */
  descripcion?: string;
};

/**
 * Lista global de campos que NUNCA deben aparecer en la bitácora aunque
 * el caller no los excluya explícitamente. Defensa en profundidad para
 * evitar que un error de tipeo en un wrapper deje hashes de password
 * en la bitácora.
 *
 * Si un caller pasa `camposPermitidos`, esa lista tiene la palabra final;
 * pero si no la pasa, estos campos se descartan automáticamente.
 */
export const CAMPOS_SENSIBLES_GLOBAL = [
  'passwordHash',
  'password',
  'token',
  'apiKey',
  'apiSecret',
  'pagosimplePin',
] as const;

const CAMPOS_SENSIBLES_SET = new Set<string>(CAMPOS_SENSIBLES_GLOBAL);

/**
 * Filtra los campos sensibles globales del objeto antes de usarlo. Solo
 * se aplica cuando el caller NO pasa `camposPermitidos` (porque si los
 * pasa, ya sabe lo que está haciendo).
 */
function descartarSensibles(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!CAMPOS_SENSIBLES_SET.has(k)) out[k] = v;
  }
  return out;
}

export type AccionAuditable = 'CREAR' | 'EDITAR' | 'ELIMINAR';

/**
 * Payload listo para pasarle a `registrarAuditoria`, o `null` si la
 * acción no merece registrarse (ej. UPDATE sin cambios reales).
 */
export type PayloadAuditoria = {
  entidad: string;
  entidadId: string;
  accion: string;
  entidadSucursalId: string | null;
  descripcion: string;
  cambios: Diff | null;
};

export function prepararPayload(
  accion: AccionAuditable,
  opts: AuditoriaOpts & {
    antes?: Record<string, unknown>;
    despues?: Record<string, unknown>;
    camposPermitidos?: string[];
  },
): PayloadAuditoria | null {
  const antes = opts.antes ?? null;
  const despues = opts.despues ?? null;

  // Filtro de sensibles solo si NO se pasó camposPermitidos.
  const antesPreparado =
    antes !== null ? (opts.camposPermitidos ? antes : descartarSensibles(antes)) : null;
  const despuesPreparado =
    despues !== null ? (opts.camposPermitidos ? despues : descartarSensibles(despues)) : null;

  const diff = calcularDiff(antesPreparado, despuesPreparado, opts.camposPermitidos);

  // Si nada quedó para registrar (CREATE/DELETE con todo filtrado, o
  // UPDATE sin cambios reales) → null. El caller no escribe.
  if (diff === null) return null;

  // Descripción por defecto.
  let descripcion = opts.descripcion;
  if (!descripcion) {
    if (accion === 'CREAR') descripcion = `Creó ${opts.entidad}`;
    else if (accion === 'ELIMINAR') descripcion = `Eliminó ${opts.entidad}`;
    else descripcion = `Editó ${opts.entidad} (${diff.campos.length} campo(s))`;
  }

  return {
    entidad: opts.entidad,
    entidadId: opts.entidadId,
    accion,
    entidadSucursalId: opts.entidadSucursalId ?? null,
    descripcion,
    cambios: diff,
  };
}
