'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { generarCobroAliado } from '@/lib/finanzas/cobro-generar';

export type ActionState = { error?: string; ok?: boolean };

/** Marca un cobro como PAGADO y desbloquea la sucursal si estaba bloqueada. */
export async function marcarCobroPagadoAction(
  cobroId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const medioPagoId = String(formData.get('medioPagoId') ?? '').trim() || null;
  const referenciaPago = String(formData.get('referenciaPago') ?? '').trim() || null;
  const observaciones = String(formData.get('observaciones') ?? '').trim() || null;

  const cobro = await prisma.cobroAliado.findUnique({
    where: { id: cobroId },
    select: { id: true, sucursalId: true, estado: true },
  });
  if (!cobro) return { error: 'Cobro no existe' };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.cobroAliado.update({
        where: { id: cobroId },
        data: {
          estado: 'PAGADO',
          fechaPagado: new Date(),
          medioPagoId,
          referenciaPago,
          observaciones,
        },
      });
      // Desbloquear la sucursal si estaba bloqueada por mora y no quedan
      // cobros vencidos/pendientes adicionales.
      const otrosMorosos = await tx.cobroAliado.count({
        where: {
          sucursalId: cobro.sucursalId,
          id: { not: cobroId },
          estado: { in: ['VENCIDO', 'PENDIENTE'] },
          fechaLimite: { lt: new Date() },
        },
      });
      if (otrosMorosos === 0) {
        await tx.sucursal.update({
          where: { id: cobro.sucursalId },
          data: { bloqueadaPorMora: false },
        });
      }
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al marcar pagado' };
  }

  revalidatePath('/admin/soporte/finanzas/cobro-aliados');
  revalidatePath(`/admin/soporte/finanzas/cobro-aliados/${cobroId}`);
  return { ok: true };
}

/** Anula un cobro (solo si está PENDIENTE o VENCIDO). */
export async function anularCobroAction(cobroId: string): Promise<ActionState> {
  await requireStaff();
  const cobro = await prisma.cobroAliado.findUnique({
    where: { id: cobroId },
    select: { id: true, estado: true, sucursalId: true },
  });
  if (!cobro) return { error: 'Cobro no existe' };
  if (cobro.estado === 'PAGADO') {
    return { error: 'No se puede anular un cobro pagado' };
  }

  await prisma.cobroAliado.update({
    where: { id: cobroId },
    data: { estado: 'ANULADO' },
  });

  // Si no quedan morosos, desbloquear sucursal
  const otros = await prisma.cobroAliado.count({
    where: {
      sucursalId: cobro.sucursalId,
      id: { not: cobroId },
      estado: { in: ['VENCIDO'] },
    },
  });
  if (otros === 0) {
    await prisma.sucursal.update({
      where: { id: cobro.sucursalId },
      data: { bloqueadaPorMora: false },
    });
  }

  revalidatePath('/admin/soporte/finanzas/cobro-aliados');
  return { ok: true };
}

/**
 * Dispara generación manual del cobro para una sucursal × período desde la UI.
 * Útil cuando el cron del último día del mes falló o se ingresan datos tarde.
 */
export async function generarCobroManualAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();
  const sucursalId = String(formData.get('sucursalId') ?? '').trim();
  const periodoId = String(formData.get('periodoId') ?? '').trim();
  const regenerar = formData.get('regenerar') === 'on';

  if (!sucursalId || !periodoId) {
    return { error: 'Sucursal y período son obligatorios' };
  }

  const res = await generarCobroAliado({
    sucursalId,
    periodoId,
    autorUserId: session.user.id,
    regenerar,
  });

  if (!res.ok) return { error: res.error };

  revalidatePath('/admin/soporte/finanzas/cobro-aliados');
  return { ok: true };
}
