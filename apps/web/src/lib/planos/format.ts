/**
 * Helpers de formato para el archivo plano PILA (resolución 2388/2016).
 *
 * Todos los campos son de ancho fijo. Los numéricos se padean con ceros a
 * la izquierda; los alfanuméricos con espacios a la derecha. Si un valor
 * excede la longitud máxima se trunca (nunca debería pasar si los datos
 * del admin son correctos, pero defensivo).
 */

/** Pad izquierda con ceros — para campos numéricos (enteros). */
export function padNum(value: number | bigint, length: number): string {
  const n = typeof value === 'bigint' ? value : Math.trunc(value);
  const s = String(n < 0 ? 0 : n);
  if (s.length >= length) return s.slice(-length);
  return s.padStart(length, '0');
}

/** Pad derecha con espacios — para campos alfanuméricos. */
export function padAlpha(
  value: string | null | undefined,
  length: number,
): string {
  const s = normalizeText(value ?? '');
  if (s.length >= length) return s.slice(0, length);
  return s.padEnd(length, ' ');
}

/** Espacios en blanco (blanco fijo). */
export function blank(length: number): string {
  return ' '.repeat(length);
}

/**
 * Tarifa en formato PILA: `0.DECIMALES` donde DECIMALES ocupa `length - 2`
 * bytes (los 2 iniciales son "0.").
 *   padTarifa(16,   7) → "0.16000"   (5 decimales)
 *   padTarifa(12.5, 7) → "0.12500"   (5 decimales)
 *   padTarifa(4.35, 9) → "0.0435000" (7 decimales — para ARL)
 *   padTarifa(0,    7) → "0.00000"
 *
 * Recibe el porcentaje tal como está en la BD (12.5 = 12.5%).
 */
export function padTarifa(percent: number | string, length: number = 7): string {
  const n = typeof percent === 'string' ? Number(percent) : percent;
  const safe = Number.isFinite(n) && n >= 0 ? n : 0;
  const decimals = length - 2;
  if (decimals < 0) return '0'.repeat(length);
  const fraction = safe / 100;
  return fraction.toFixed(decimals);
}

/**
 * Valor monetario sin centavos. PILA los reporta como enteros. Los
 * Decimal de Prisma deben pasarse a Number antes.
 *
 * Importante: se TRUNCAN decimales (no se redondean). Ej: $1.500.000,50
 * se envía como "001500000". El salario debe ser exacto.
 *
 * Los valores de cotización (IBC, aportes) ya vienen redondeados desde
 * el motor de liquidación — el trunc no los altera.
 */
export function padMoney(
  value: number | string | null | undefined,
  length: number,
): string {
  if (value == null) return '0'.repeat(length);
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0'.repeat(length);
  return padNum(Math.max(0, Math.trunc(n)), length);
}

/** Fecha AAAA-MM-DD (10 bytes). Si no hay fecha, 10 espacios. */
export function padDate(date: Date | string | null | undefined): string {
  if (!date) return blank(10);
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return blank(10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Período AAAA-MM (7 bytes). */
export function padPeriodo(anio: number, mes: number): string {
  const y = String(anio).padStart(4, '0').slice(-4);
  const m = String(mes).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Avanza o retrocede `n` meses desde (anio, mes). Retorna nuevo (anio, mes).
 */
export function shiftMes(
  anio: number,
  mes: number,
  deltaMeses: number,
): { anio: number; mes: number } {
  const total = anio * 12 + (mes - 1) + deltaMeses;
  return {
    anio: Math.floor(total / 12),
    mes: (total % 12) + 1,
  };
}

/**
 * Normaliza texto para PILA:
 *   - Remueve acentos (usa el valor ASCII puro).
 *   - Upercase.
 *   - Elimina caracteres no permitidos (deja letras, dígitos, espacios,
 *     guiones, puntos, apóstrofes).
 *   - Colapsa múltiples espacios.
 *   - Trim.
 */
export function normalizeText(s: string): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toUpperCase()
    .replace(/[^A-Z0-9 \-.']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula la longitud de un string construido. Útil para validar que los
 * campos armados tienen la longitud esperada (assertion defensiva).
 */
export function assertLength(value: string, expected: number, campo: string): string {
  if (value.length !== expected) {
    throw new Error(
      `Campo "${campo}" tiene longitud ${value.length}, se esperaba ${expected}`,
    );
  }
  return value;
}
