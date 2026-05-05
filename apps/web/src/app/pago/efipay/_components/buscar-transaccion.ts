import 'server-only';
import { prisma } from '@pila/db';

/**
 * Busca la transacción Efipay para mostrar en las páginas de retorno
 * (éxito / rechazado / pendiente).
 *
 * Efipay puede pasar varios query params al redirigir — `payment_id`,
 * `transaction_id`, `reference`. Probamos en orden de especificidad.
 *
 * Si no encuentra nada por params (ej. el aliado refrescó la página y
 * los query params se perdieron), cae a "última transacción del día"
 * para no dejar al usuario sin información — es un comportamiento
 * razonable porque el aliado típicamente tiene un solo intento activo.
 */
export type EfipaySearchParams = {
  payment_id?: string;
  transaction_id?: string;
  reference?: string;
  status?: string;
};

export async function buscarTransaccionEfipay(sp: EfipaySearchParams) {
  const paymentId = sp.payment_id ?? sp.transaction_id;
  const referencia = sp.reference;

  if (paymentId) {
    const trx = await prisma.efipayTransaccion.findFirst({
      where: { efipayPaymentId: paymentId },
      include: {
        cobro: {
          include: {
            sucursal: { select: { codigo: true, nombre: true } },
            periodo: { select: { anio: true, mes: true } },
          },
        },
      },
    });
    if (trx) return trx;
  }

  if (referencia) {
    const trx = await prisma.efipayTransaccion.findFirst({
      where: { referencia },
      orderBy: { iniciadaEn: 'desc' },
      include: {
        cobro: {
          include: {
            sucursal: { select: { codigo: true, nombre: true } },
            periodo: { select: { anio: true, mes: true } },
          },
        },
      },
    });
    if (trx) return trx;
  }

  // Fallback: última transacción de las últimas 24h. Ayuda cuando el
  // aliado aterriza acá sin params (refrescó, cerró el tab, etc.).
  const desdeHace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.efipayTransaccion.findFirst({
    where: { iniciadaEn: { gte: desdeHace24h } },
    orderBy: { iniciadaEn: 'desc' },
    include: {
      cobro: {
        include: {
          sucursal: { select: { codigo: true, nombre: true } },
          periodo: { select: { anio: true, mes: true } },
        },
      },
    },
  });
}
