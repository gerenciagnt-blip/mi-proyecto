'use server';

/**
 * Reconciliación manual de pagos Efipay — para cuando el webhook NO
 * llegó (URL pública mal configurada, comercio sin webhook configurado
 * en dashboard Efipay, etc.) pero el aliado SÍ pagó exitosamente en la
 * pasarela.
 *
 * Solo staff (ADMIN/SOPORTE) puede invocar. Marca la EfipayTransaccion
 * como APROBADA, marca el CobroAliado como PAGADO y deja registro de
 * auditoría con el userName que hizo la reconciliación, para que sea
 * trazable contra la conciliación bancaria.
 *
 * NOTA: Cuando el webhook funcione bien, esto debería ser excepcional.
 * Si se usa frecuentemente, indica que hay que arreglar la configuración
 * del webhook en Efipay.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { auditarEvento } from '@/lib/auditoria';
import { createLogger } from '@/lib/logger';

const log = createLogger('efipay-reconciliacion');

export type ReconciliarResult = { ok: true } | { ok: false; error: string };

export async function reconciliarTransaccionEfipayAction(
  transaccionId: string,
  observacion?: string,
): Promise<ReconciliarResult> {
  const session = await requireStaff();
  const userId = session.user.id;
  const userName = session.user.name;

  const trx = await prisma.efipayTransaccion.findUnique({
    where: { id: transaccionId },
    include: {
      cobro: {
        select: {
          id: true,
          consecutivo: true,
          estado: true,
          sucursalId: true,
        },
      },
    },
  });
  if (!trx) return { ok: false, error: 'Transacción no encontrada' };

  if (trx.estado === 'APROBADA') {
    return { ok: false, error: 'La transacción ya está APROBADA — no requiere reconciliación.' };
  }
  if (trx.estado === 'RECHAZADA' || trx.estado === 'EXPIRADA') {
    return {
      ok: false,
      error: `La transacción está ${trx.estado.toLowerCase()} — no se puede reconciliar como aprobada. Si el pago se hizo, crea una nueva transacción.`,
    };
  }

  if (trx.cobro.estado === 'PAGADO') {
    return { ok: false, error: 'El cobro ya está PAGADO. No requiere reconciliación adicional.' };
  }
  if (trx.cobro.estado === 'ANULADO') {
    return { ok: false, error: 'El cobro está ANULADO. No se puede marcar como pagado.' };
  }

  const ahora = new Date();
  const motivo = `Reconciliación manual por ${userName}${observacion ? ` — ${observacion.slice(0, 200)}` : ''}`;

  await prisma.$transaction(async (tx) => {
    await tx.efipayTransaccion.update({
      where: { id: trx.id },
      data: {
        estado: 'APROBADA',
        aprobadaEn: ahora,
        motivo,
      },
    });
    await tx.cobroAliado.update({
      where: { id: trx.cobro.id },
      data: {
        estado: 'PAGADO',
        fechaPagado: ahora,
        referenciaPago: trx.efipayPaymentId
          ? `EFIPAY-RECON:${trx.efipayPaymentId}`
          : `EFIPAY-RECON:${trx.id}`,
      },
    });
  });

  await auditarEvento({
    entidad: 'CobroAliado',
    entidadId: trx.cobro.id,
    accion: 'PAGO_EFIPAY_RECONCILIADO',
    entidadSucursalId: trx.cobro.sucursalId,
    descripcion: `Reconciliación manual de pago Efipay sobre ${trx.cobro.consecutivo} por ${userName}${observacion ? ` (${observacion.slice(0, 100)})` : ''}`,
    cambios: {
      antes: { estado: trx.cobro.estado, trxEstado: trx.estado },
      despues: { estado: 'PAGADO', trxEstado: 'APROBADA' },
      campos: ['estado'],
    },
  });

  log.info(
    {
      trxId: trx.id,
      cobroId: trx.cobro.id,
      consecutivo: trx.cobro.consecutivo,
      reconciliadoPor: userId,
    },
    'Transacción Efipay reconciliada manualmente',
  );

  revalidatePath('/admin/soporte/finanzas/cobro-aliados');
  revalidatePath(`/admin/soporte/finanzas/cobro-aliados/${trx.cobro.id}`);
  revalidatePath('/admin');
  return { ok: true };
}
