/**
 * Cálculo de diferencias entre dos snapshots de un mismo recurso.
 *
 * Función pura, sin dependencias externas, fácil de testear. Se usa al
 * registrar un evento UPDATE para no almacenar el objeto completo (que
 * puede tener 30+ campos), sino solo lo que efectivamente cambió.
 *
 * Reglas de comparación:
 *   - Strings, números, booleanos → comparación por valor.
 *   - null y undefined se consideran equivalentes (ej. campo opcional
 *     que pasó de null a undefined no genera diff).
 *   - Date → compara por timestamp.
 *   - Decimal de Prisma → llega como string normalmente; lo comparamos
 *     como string. Si llega como objeto Decimal, llamamos `toString()`.
 *   - Arrays / objetos → JSON.stringify (suficiente para auditoría).
 *
 * Resultado:
 *   - Si nada cambió → `null` (el caller decide si vale la pena escribir
 *     un AuditLog igual con resumen libre o saltar el registro).
 *   - Si hubo cambio → `{ antes: { ... }, despues: { ... }, campos: [...] }`
 *     donde `antes` y `despues` solo incluyen los campos modificados.
 */

export type Diff = {
  /** Sub-objeto con los valores anteriores de los campos cambiados. */
  antes: Record<string, unknown>;
  /** Sub-objeto con los valores nuevos de los campos cambiados. */
  despues: Record<string, unknown>;
  /** Lista de los nombres de los campos cambiados (para mostrar count). */
  campos: string[];
};

/**
 * Normaliza un valor a algo comparable. null/undefined se tratan iguales
 * para no marcar diff cuando un campo opcional pasa de null a undefined
 * o viceversa (es ruido).
 */
function normalizar(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.getTime();
  // Prisma Decimal puede llegar como objeto con `toString()` o como string
  // crudo. Lo unificamos a string.
  if (
    typeof v === 'object' &&
    v !== null &&
    'toString' in v &&
    typeof (v as { toString: () => string }).toString === 'function'
  ) {
    // Solo aplicamos para tipos no-plain-object
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== Array.prototype && !(v instanceof Date)) {
      return (v as { toString: () => string }).toString();
    }
  }
  return v;
}

function sonIguales(a: unknown, b: unknown): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (na === nb) return true;
  if (na === null || nb === null) return false;
  if (typeof na === 'object' && typeof nb === 'object') {
    return JSON.stringify(na) === JSON.stringify(nb);
  }
  return false;
}

/**
 * Calcula el diff entre dos objetos.
 *
 * @param antes Snapshot del recurso antes del cambio (lo que había en BD).
 * @param despues Snapshot del recurso después del cambio (lo que se acaba
 *   de guardar). Si solo se actualizaron N campos, lo correcto es pasar
 *   el objeto completo después; los campos no modificados se filtran solos.
 * @param camposPermitidos Lista opcional de campos a considerar. Si se
 *   pasa, los demás se ignoran (útil para no exponer fields sensibles
 *   tipo `passwordHash` por accidente). Si es undefined, se comparan
 *   todos los campos presentes en cualquiera de los dos objetos.
 * @returns null si no hay cambios reales, o un Diff con la información.
 */
export function calcularDiff(
  antes: Record<string, unknown> | null,
  despues: Record<string, unknown> | null,
  camposPermitidos?: string[],
): Diff | null {
  // Casos triviales: ambos null o uno solo.
  if (antes === null && despues === null) return null;

  if (antes === null && despues !== null) {
    const campos = camposPermitidos ?? Object.keys(despues);
    const desp: Record<string, unknown> = {};
    for (const k of campos) {
      if (k in despues) desp[k] = despues[k];
    }
    if (Object.keys(desp).length === 0) return null;
    return { antes: {}, despues: desp, campos: Object.keys(desp) };
  }

  if (despues === null && antes !== null) {
    const campos = camposPermitidos ?? Object.keys(antes);
    const ant: Record<string, unknown> = {};
    for (const k of campos) {
      if (k in antes) ant[k] = antes[k];
    }
    if (Object.keys(ant).length === 0) return null;
    return { antes: ant, despues: {}, campos: Object.keys(ant) };
  }

  // Ambos no-null: compara campo a campo.
  const a = antes!;
  const d = despues!;
  const claves = camposPermitidos ?? Array.from(new Set([...Object.keys(a), ...Object.keys(d)]));

  const antesOut: Record<string, unknown> = {};
  const despuesOut: Record<string, unknown> = {};
  const camposCambiados: string[] = [];

  for (const k of claves) {
    if (!sonIguales(a[k], d[k])) {
      antesOut[k] = a[k] ?? null;
      despuesOut[k] = d[k] ?? null;
      camposCambiados.push(k);
    }
  }

  if (camposCambiados.length === 0) return null;
  return { antes: antesOut, despues: despuesOut, campos: camposCambiados };
}
