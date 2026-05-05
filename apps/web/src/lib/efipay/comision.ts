/**
 * Cálculo del sobrecosto que se cobra al aliado al pagar via Efipay.
 *
 * Este archivo USA `Prisma.Decimal` y solo debe importarse desde
 * server-side (server actions, route handlers, server components). Para
 * UI cliente, importa desde `./comision-utils.ts` que tiene los mismos
 * cálculos en `number` sin tocar el cliente Prisma.
 *
 * Política comercial (2026-05): Efipay nos cobra ~2.52% por transacción.
 * Para mitigar parcialmente ese costo, al aliado se le carga un 1%
 * sobre el `totalCobro`. La diferencia (~1.52%) la asume la operación.
 */

import 'server-only';
import { Prisma } from '@pila/db';

// Re-exportar las constantes y la versión `number` desde el archivo cliente-safe
// para que el server pueda usar las mismas constantes con un solo import si quiere.
export {
  SOBRECOSTO_PORCENTAJE,
  COMISION_EFIPAY_PORCENTAJE,
  calcularDesglosePagoEfipayNumber,
} from './comision-utils';

import { SOBRECOSTO_PORCENTAJE } from './comision-utils';

export type DesglosePagoEfipay = {
  /** Total del CobroAliado, sin sobrecosto. Lo que se le debe al operador. */
  montoBase: Prisma.Decimal;
  /** Sobrecosto cobrado al aliado por usar Efipay (1% del montoBase). */
  sobrecosto: Prisma.Decimal;
  /** Lo que efectivamente paga el aliado (montoBase + sobrecosto). */
  montoCobrado: Prisma.Decimal;
};

/**
 * Calcula el desglose del pago para un cobro dado, usando Prisma.Decimal
 * para evitar pérdidas de precisión.
 *
 * Redondeo: el sobrecosto se redondea a 2 decimales (HALF_UP). Efipay
 * acepta hasta 2 decimales según la doc.
 */
export function calcularDesglosePagoEfipay(montoBase: Prisma.Decimal): DesglosePagoEfipay {
  const base = new Prisma.Decimal(montoBase);
  const sobrecosto = base
    .mul(SOBRECOSTO_PORCENTAJE)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const montoCobrado = base.add(sobrecosto);
  return { montoBase: base, sobrecosto, montoCobrado };
}
