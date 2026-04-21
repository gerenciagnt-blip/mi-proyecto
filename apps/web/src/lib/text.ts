/**
 * Normaliza un texto a "Title Case" al estilo de nombres propios en español:
 *   - Primera letra de cada palabra en mayúscula
 *   - Resto en minúscula
 *   - Preposiciones y conectores cortos se mantienen en minúscula (de, del, la, los, y, e, o, en)
 *   - Respeta apóstrofes y guiones (D'Angelo, María-José)
 *   - Colapsa espacios repetidos
 *
 * Casos:
 *   "JUAN ALEXANDER SEPÚLVEDA"  -> "Juan Alexander Sepúlveda"
 *   "maría  de los ÁNGELES"     -> "María de los Ángeles"
 *   "  carlos   "               -> "Carlos"
 */
const MINUSCULAS = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'en', 'da', 'van',
  'der', 'von', 'di',
]);

export function titleCase(raw: string | null | undefined): string {
  if (!raw) return '';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';

  return collapsed
    .split(' ')
    .map((word, i) => capitalizeWord(word, i === 0))
    .join(' ');
}

function capitalizeWord(word: string, isFirst: boolean): string {
  const lower = word.toLocaleLowerCase('es-CO');
  // Conectores en minúscula excepto la primera palabra.
  if (!isFirst && MINUSCULAS.has(lower)) return lower;

  // Capitaliza respetando separadores (guión, apóstrofe).
  return lower.replace(/(^|[-'’])([\p{L}])/gu, (_, sep: string, ch: string) =>
    sep + ch.toLocaleUpperCase('es-CO'),
  );
}

/**
 * Primera letra mayúscula del string entero; el resto queda como está (solo
 * colapsa espacios al principio/fin). Útil para comentarios y descripciones
 * donde no queremos cambiar mayúsculas dentro del texto.
 */
export function sentenceCase(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toLocaleUpperCase('es-CO') + trimmed.slice(1);
}

/**
 * Aplica `titleCase` a un objeto en un set de llaves específicas,
 * preservando null y undefined. Devuelve un shallow copy.
 */
export function titleCaseFields<T extends Record<string, unknown>>(
  obj: T,
  keys: (keyof T)[],
): T {
  const out: Record<string, unknown> = { ...obj };
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string') out[k as string] = titleCase(v);
  }
  return out as T;
}
