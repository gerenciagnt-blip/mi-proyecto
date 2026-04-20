/**
 * Calcula el dígito de verificación (DV) de un NIT colombiano.
 * Algoritmo oficial DIAN.
 */
export function calcularDV(nit: string): string | null {
  const digits = nit.replace(/\D/g, '');
  if (digits.length < 5 || digits.length > 15) return null;

  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let sum = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    sum += Number(reversed[i]) * (weights[i] ?? 0);
  }
  const mod = sum % 11;
  return mod < 2 ? String(mod) : String(11 - mod);
}
