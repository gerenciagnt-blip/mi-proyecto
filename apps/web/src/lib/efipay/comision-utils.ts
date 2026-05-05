/**
 * Helpers de cálculo de comisión Efipay SAFE para usar en el cliente.
 *
 * Sin dependencias de `@pila/db` ni Prisma.Decimal — el bundler de Next
 * lo puede incluir en el bundle browser sin arrastrar el cliente Prisma.
 *
 * La versión con Decimal (para BD) vive en `./comision.ts` y solo debe
 * importarse desde server actions / server components.
 */

/** Porcentaje de sobrecosto al aliado (1%). */
export const SOBRECOSTO_PORCENTAJE = 0.01;

/** Porcentaje real que cobra Efipay (informativo, para reportes). */
export const COMISION_EFIPAY_PORCENTAJE = 0.0252;

/**
 * Calcula el desglose en `number` (precisión float). Para mostrar al
 * aliado en la UI antes de iniciar el pago. La versión exacta para BD
 * vive en `comision.ts` y usa Prisma.Decimal.
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
