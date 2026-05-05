'use server';

/**
 * Server actions de Efipay — invocables desde la UI del aliado.
 *
 * Reglas de seguridad:
 *  - El aliado SOLO puede iniciar pagos sobre cobros de SU sucursal.
 *  - Staff (ADMIN/SOPORTE) puede iniciarlos sobre cualquier cobro
 *    (útil para asistencia o pruebas).
 *  - El cobro debe estar PENDIENTE o VENCIDO. Si ya fue PAGADO o
 *    ANULADO se rechaza.
 */

import { revalidatePath } from 'next/cache';
import type { CobroAliadoEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { auditarEvento } from '@/lib/auditoria';
import { createLogger } from '@/lib/logger';
import { crearPagoEfipay } from './client';
import { calcularDesglosePagoEfipay } from './comision';

const log = createLogger('efipay-server');

export type IniciarPagoResult =
  | { ok: true; checkoutUrl: string; transaccionId: string }
  | { ok: false; error: string };

/** Estados desde los cuales se puede iniciar un pago Efipay. */
const ESTADOS_PAGABLES: ReadonlySet<CobroAliadoEstado> = new Set(['PENDIENTE', 'VENCIDO']);

/**
 * Inicia un nuevo intento de pago Efipay para un CobroAliado.
 *
 * Crea un registro `EfipayTransaccion` PENDIENTE, llama a Efipay y
 * devuelve la URL de checkout. La UI redirige al aliado a esa URL.
 *
 * Si el aliado tenía un intento PENDIENTE previo no se invalida — la
 * lógica del webhook decide qué transacción "gana" (la APROBADA primero).
 */
export async function iniciarPagoEfipayAction(cobroId: string): Promise<IniciarPagoResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  const userRole = session.user.role;
  const userSucursalId = session.user.sucursalId;

  const cobro = await prisma.cobroAliado.findUnique({
    where: { id: cobroId },
    select: {
      id: true,
      consecutivo: true,
      sucursalId: true,
      totalCobro: true,
      estado: true,
      periodo: { select: { anio: true, mes: true } },
      sucursal: { select: { nombre: true } },
    },
  });
  if (!cobro) return { ok: false, error: 'Cobro no encontrado' };

  // Autorización: el aliado solo puede pagar SU cobro. Staff puede pagar
  // cualquiera (asistencia técnica).
  const esStaff = userRole === 'ADMIN' || userRole === 'SOPORTE';
  if (!esStaff && cobro.sucursalId !== userSucursalId) {
    log.warn(
      { userId, userSucursalId, cobroSucursalId: cobro.sucursalId, cobroId },
      'Intento de pago sobre cobro de OTRA sucursal — denegado',
    );
    return { ok: false, error: 'No tienes permiso para pagar este cobro.' };
  }

  if (!ESTADOS_PAGABLES.has(cobro.estado)) {
    return {
      ok: false,
      error: `Este cobro está ${cobro.estado.toLowerCase()} y no admite pagos via Efipay.`,
    };
  }

  // Calcular desglose (montoBase + sobrecosto 1%)
  const desglose = calcularDesglosePagoEfipay(cobro.totalCobro);
  const montoCobradoNumber = Number(desglose.montoCobrado);

  // Descripción amigable para el extracto del aliado
  const periodoLabel = `${String(cobro.periodo.mes).padStart(2, '0')}/${cobro.periodo.anio}`;
  const descripcion = `Sistema PILA · Cobro ${cobro.consecutivo} (período ${periodoLabel})`;

  // Llamada a Efipay
  const efipayResult = await crearPagoEfipay({
    descripcion,
    monto: montoCobradoNumber,
    referencias: [cobro.consecutivo],
  });

  // Persistir el intento — incluso si Efipay falló, queda registro con
  // estado ERROR para diagnóstico
  if (!efipayResult.ok) {
    await prisma.efipayTransaccion.create({
      data: {
        cobroAliadoId: cobro.id,
        referencia: cobro.consecutivo,
        montoBase: desglose.montoBase,
        sobrecosto: desglose.sobrecosto,
        montoCobrado: desglose.montoCobrado,
        estado: 'ERROR',
        motivo: efipayResult.error.slice(0, 500),
        iniciadaPorId: userId,
      },
    });
    return { ok: false, error: `No fue posible crear el pago en Efipay: ${efipayResult.error}` };
  }

  const transaccion = await prisma.efipayTransaccion.create({
    data: {
      cobroAliadoId: cobro.id,
      efipayPaymentId: efipayResult.paymentId,
      referencia: cobro.consecutivo,
      montoBase: desglose.montoBase,
      sobrecosto: desglose.sobrecosto,
      montoCobrado: desglose.montoCobrado,
      urlCheckout: efipayResult.checkoutUrl,
      estado: 'PENDIENTE',
      iniciadaPorId: userId,
    },
    select: { id: true },
  });

  await auditarEvento({
    entidad: 'CobroAliado',
    entidadId: cobro.id,
    accion: 'INICIAR_PAGO_EFIPAY',
    entidadSucursalId: cobro.sucursalId,
    descripcion: `Aliado ${cobro.sucursal.nombre} inició pago Efipay de ${cobro.consecutivo} por $${montoCobradoNumber}`,
    cambios: null,
  });

  revalidatePath('/admin');
  revalidatePath('/admin/soporte/finanzas/cobro-aliados');
  revalidatePath(`/admin/soporte/finanzas/cobro-aliados/${cobro.id}`);

  return {
    ok: true,
    checkoutUrl: efipayResult.checkoutUrl,
    transaccionId: transaccion.id,
  };
}
