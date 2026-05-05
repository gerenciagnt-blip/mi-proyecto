/**
 * Cálculo del sobrecosto que se cobra al aliado al pagar via Efipay.
 *
 * Política comercial (2026-05): Efipay nos cobra ~2.52% por transacción.
 * Para mitigar parcialmente ese costo, al aliado se le carga un 1%
 * sobre el `totalCobro`. La diferencia (~1.52%) la asume la operación.
 *
 * Si en el futuro se quiere cambiar la política (cobrar el 100%, eximir
 * a algunos aliados, escalonar por monto, etc.), todo se centraliza acá.
 */

import { Prisma } from '@pila/db';

/** Porcentaje de sobrecosto al aliado (1%). */
export const SOBRECOSTO_PORCENTAJE = 0.01;

/** Porcentaje real que cobra Efipay (informativo, para reportes). */
export const COMISION_EFIPAY_PORCENTAJE = 0.0252;

export type DesglosePagoEfipay = {
  /** Total del CobroAliado, sin sobrecosto. Lo que se le debe al operador. */
  montoBase: Prisma.Decimal;
  /** Sobrecosto cobrado al aliado por usar Efipay (1% del montoBase). */
  sobrecosto: Prisma.Decimal;
  /** Lo que efectivamente paga el aliado (montoBase + sobrecosto). */
  montoCobrado: Prisma.Decimal;
};

/**
 * Calcula el desglose del pago para un cobro dado.
 *
 * Redondeo: el sobrecosto se redondea a 2 decimales hacia arriba (Efipay
 * acepta hasta 2 decimales según la doc). Esto nunca beneficia al operador
 * por encima del 1% pero evita que un sobrecosto $X.X05 se trunque.
 */
export function calcularDesglosePagoEfipay(montoBase: Prisma.Decimal): DesglosePagoEfipay {
  const base = new Prisma.Decimal(montoBase);
  // multiplicación + redondeo a 2 decimales (HALF_UP)
  const sobrecosto = base
    .mul(SOBRECOSTO_PORCENTAJE)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const montoCobrado = base.add(sobrecosto);
  return { montoBase: base, sobrecosto, montoCobrado };
}

/**
 * Versión pura para usar en el cliente (donde no se puede importar
 * `Prisma.Decimal`). Trabaja con `number`. Para BD usar siempre la
 * versión con Decimal.
 */
export function calcularDesglosePagoEfipayNumber(montoBase: number): {
  montoBase: number;
  sobrecosto: number;
  montoCobrado: number;
} {
  const sobrecosto = Math.round(montoBase * SOBRECOSTO_PORCENTAJE * 100) / 100;
  return {
    montoBase,
    sobrecosto,
    montoCobrado: montoBase + sobrecosto,
  };
}
