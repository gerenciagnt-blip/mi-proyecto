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
import type { EfipayEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { auditarEvento } from '@/lib/auditoria';
import { createLogger } from '@/lib/logger';
import { consultarEstadoEfipay } from './client';

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

// ─────────────────────────────────────────────────────────────────────
// Reconciliación masiva — consulta a Efipay todas las trx PENDIENTE y
// actualiza según el estado real de la pasarela. Es el reemplazo del
// webhook cuando éste no llega (lo más común en dev sin túnel público).
// ─────────────────────────────────────────────────────────────────────

export type ReconciliarMasivoResult = {
  consultadas: number;
  aprobadas: number;
  rechazadas: number;
  expiradas: number;
  sinCambio: number;
  fallos: number;
  errores: Array<{ trxId: string; referencia: string; error: string }>;
};

/**
 * Itera todas las EfipayTransaccion en estado PENDIENTE (con
 * efipayPaymentId, ignora ERROR), consulta Efipay por su estado real, y
 * aplica la actualización idéntica a la del webhook (marca trx APROBADA/
 * RECHAZADA y CobroAliado PAGADO si corresponde).
 *
 * `requireSession`:
 *   - true (default) → exige sesión staff (uso desde UI). El userName se
 *     usa para auditar.
 *   - false → permite invocar sin sesión (uso desde cron / endpoint
 *     interno protegido por shared secret). Auditoría queda con
 *     userName='cron-efipay'.
 *
 * @param maxAge — opcional, solo reconcilia trx más recientes que X días
 *                 (default: sin límite). Útil para no consultar trx
 *                 muy viejas que ya nadie va a aprobar.
 */
export async function reconciliarTodasPendientesAction(opts?: {
  requireSession?: boolean;
  maxAgeDias?: number;
}): Promise<ReconciliarMasivoResult> {
  const requireSession = opts?.requireSession ?? true;
  let userName = 'cron-efipay';
  if (requireSession) {
    const session = await requireStaff();
    userName = session.user.name;
  }

  const where: {
    estado: 'PENDIENTE';
    efipayPaymentId: { not: null };
    iniciadaEn?: { gte: Date };
  } = {
    estado: 'PENDIENTE',
    efipayPaymentId: { not: null },
  };
  if (opts?.maxAgeDias && opts.maxAgeDias > 0) {
    where.iniciadaEn = { gte: new Date(Date.now() - opts.maxAgeDias * 24 * 60 * 60 * 1000) };
  }

  const pendientes = await prisma.efipayTransaccion.findMany({
    where,
    orderBy: { iniciadaEn: 'desc' },
    take: 200, // batch — más que suficiente para uso normal
    select: {
      id: true,
      efipayPaymentId: true,
      referencia: true,
      cobroAliadoId: true,
      cobro: {
        select: { id: true, estado: true, sucursalId: true, consecutivo: true },
      },
    },
  });

  const result: ReconciliarMasivoResult = {
    consultadas: pendientes.length,
    aprobadas: 0,
    rechazadas: 0,
    expiradas: 0,
    sinCambio: 0,
    fallos: 0,
    errores: [],
  };

  for (const trx of pendientes) {
    if (!trx.efipayPaymentId) continue;

    const consulta = await consultarEstadoEfipay(trx.efipayPaymentId);
    if (!consulta.ok) {
      result.fallos++;
      result.errores.push({
        trxId: trx.id,
        referencia: trx.referencia,
        error: consulta.error,
      });
      continue;
    }

    if (consulta.estado === 'PENDIENTE') {
      result.sinCambio++;
      continue;
    }

    // Cambio de estado — aplicar
    const ahora = new Date();
    const nuevoEstado: EfipayEstado = consulta.estado;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.efipayTransaccion.update({
          where: { id: trx.id },
          data: {
            estado: nuevoEstado,
            motivo: `Reconciliado vía polling (${userName}) — status raw: ${consulta.statusRaw}`,
            webhookPayload: consulta.raw as object,
            webhookRecibidoEn: ahora,
            intentosWebhook: { increment: 1 },
            aprobadaEn: nuevoEstado === 'APROBADA' ? ahora : undefined,
            rechazadaEn: nuevoEstado === 'RECHAZADA' ? ahora : undefined,
            expiradaEn: nuevoEstado === 'EXPIRADA' ? ahora : undefined,
          },
        });

        if (nuevoEstado === 'APROBADA' && trx.cobro.estado !== 'PAGADO') {
          await tx.cobroAliado.update({
            where: { id: trx.cobro.id },
            data: {
              estado: 'PAGADO',
              fechaPagado: ahora,
              referenciaPago: `EFIPAY:${trx.efipayPaymentId}`,
            },
          });
        }
      });

      if (nuevoEstado === 'APROBADA') {
        result.aprobadas++;
        await auditarEvento({
          entidad: 'CobroAliado',
          entidadId: trx.cobro.id,
          accion: 'PAGO_EFIPAY_APROBADO_POLLING',
          entidadSucursalId: trx.cobro.sucursalId,
          descripcion: `Pago Efipay aprobado vía reconciliación polling (${userName}) · ${trx.cobro.consecutivo}`,
          cambios: {
            antes: { estado: trx.cobro.estado },
            despues: { estado: 'PAGADO' },
            campos: ['estado'],
          },
        });
      } else if (nuevoEstado === 'RECHAZADA') {
        result.rechazadas++;
      } else if (nuevoEstado === 'EXPIRADA') {
        result.expiradas++;
      }
    } catch (err) {
      result.fallos++;
      result.errores.push({
        trxId: trx.id,
        referencia: trx.referencia,
        error: `BD: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error({ err, trxId: trx.id }, 'Error aplicando reconciliación');
    }
  }

  log.info(result, 'Reconciliación masiva Efipay completada');

  if (result.aprobadas > 0 || result.rechazadas > 0 || result.expiradas > 0) {
    revalidatePath('/admin/soporte/finanzas/cobro-aliados');
    revalidatePath('/admin');
  }
  return result;
}
