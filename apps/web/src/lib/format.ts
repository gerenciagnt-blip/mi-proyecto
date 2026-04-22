/**
 * Formatters centralizados. Estaban duplicados como constantes locales
 * `copFmt`, `fullName`, `hoyIso` en ~20 archivos.
 *
 * Nota: las constantes con `Intl.NumberFormat` pueden reutilizarse
 * libremente porque son puras y thread-safe.
 */

// ---------- Moneda ----------

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Formatea un número como moneda COP sin decimales. Ej: `1500000 → "$1.500.000"`. */
export function formatCOP(valor: number | bigint): string {
  return copFormatter.format(valor);
}

const copDecFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formato COP con 2 decimales, para tarifas o porcentajes. */
export function formatCOPDec(valor: number): string {
  return copDecFormatter.format(valor);
}

// ---------- Fechas ----------

/** Fecha de hoy en formato ISO `YYYY-MM-DD` (timezone local). */
export function hoyIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parsea un string `YYYY-MM-DD` como mediodía UTC para evitar
 * corrimiento por zona horaria (en Colombia UTC-5, una fecha parseada
 * como UTC midnight cae al día anterior).
 */
export function parseIsoToUtcNoon(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

const fechaLegibleFmt = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

/** Fecha legible "martes, 22 de abril de 2026" a partir de un ISO. */
export function fechaLegibleDesdeIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return fechaLegibleFmt.format(new Date(y, m - 1, d));
}

// ---------- Nombres ----------

/**
 * Nombre completo compacto (primer nombre + primer apellido).
 * Para uso en listados/tablas donde el nombre completo ocuparía demasiado.
 */
export function fullName(c: {
  primerNombre: string;
  primerApellido: string;
}): string {
  return `${c.primerNombre} ${c.primerApellido}`.trim();
}

/**
 * Nombre completo extendido (incluye segundos nombre/apellido si existen).
 * Para uso en PDFs, comprobantes y vistas de detalle.
 */
export function nombreCompleto(c: {
  primerNombre: string;
  segundoNombre?: string | null;
  primerApellido: string;
  segundoApellido?: string | null;
}): string {
  return [c.primerNombre, c.segundoNombre, c.primerApellido, c.segundoApellido]
    .filter(Boolean)
    .join(' ')
    .trim();
}
