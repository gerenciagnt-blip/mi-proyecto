'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { persistirLiquidacion } from '@/lib/liquidacion/calcular';

export type ActionState = { error?: string; ok?: boolean; mensaje?: string };

/**
 * Abre (o recupera) el período contable del mes indicado. Snapshot del
 * SMLV al momento de la apertura.
 */
export async function abrirPeriodoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const anio = Number(formData.get('anio'));
  const mes = Number(formData.get('mes'));
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) return { error: 'Año inválido' };
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { error: 'Mes inválido' };

  const smlv = await prisma.smlvConfig.findUnique({ where: { id: 'singleton' } });
  if (!smlv) return { error: 'No hay SMLV configurado — ve a Catálogos → SMLV' };

  const existing = await prisma.periodoContable.findUnique({
    where: { anio_mes: { anio, mes } },
  });
  if (existing) {
    revalidatePath('/admin/transacciones');
    return { ok: true, mensaje: 'Período ya estaba abierto' };
  }

  await prisma.periodoContable.create({
    data: { anio, mes, smlvSnapshot: smlv.valor },
  });

  revalidatePath('/admin/transacciones');
  return { ok: true, mensaje: `Período ${anio}-${String(mes).padStart(2, '0')} abierto` };
}

/**
 * Cierra un período — snapshot final, no se puede recalcular.
 */
export async function cerrarPeriodoAction(periodoId: string) {
  await requireAdmin();
  await prisma.periodoContable.update({
    where: { id: periodoId },
    data: { estado: 'CERRADO', cerradoEn: new Date() },
  });
  revalidatePath('/admin/transacciones');
}

export async function reabrirPeriodoAction(periodoId: string) {
  await requireAdmin();
  await prisma.periodoContable.update({
    where: { id: periodoId },
    data: { estado: 'ABIERTO', cerradoEn: null },
  });
  revalidatePath('/admin/transacciones');
}

/**
 * Corre el motor sobre todas las afiliaciones ACTIVAS del sistema para
 * el período dado. Crea/actualiza la liquidación de cada una.
 */
export async function liquidarPeriodoAction(periodoId: string): Promise<ActionState> {
  await requireAdmin();

  const periodo = await prisma.periodoContable.findUnique({ where: { id: periodoId } });
  if (!periodo) return { error: 'Período no existe' };
  if (periodo.estado === 'CERRADO') return { error: 'Período cerrado — reabrir primero' };

  const afiliacionesActivas = await prisma.afiliacion.findMany({
    where: { estado: 'ACTIVA' },
    select: { id: true },
  });

  let procesadas = 0;
  let errores = 0;
  for (const a of afiliacionesActivas) {
    try {
      await persistirLiquidacion(prisma, {
        periodoId,
        afiliacionId: a.id,
      });
      procesadas++;
    } catch {
      errores++;
    }
  }

  revalidatePath('/admin/transacciones');
  return {
    ok: true,
    mensaje: `Liquidadas ${procesadas} afiliaciones${errores ? ` (${errores} con error)` : ''}`,
  };
}

/**
 * Recalcula una liquidación individual. Útil cuando cambió una tarifa
 * o el IBC de una afiliación.
 */
export async function recalcularLiquidacionAction(liquidacionId: string) {
  await requireAdmin();
  const liq = await prisma.liquidacion.findUnique({
    where: { id: liquidacionId },
    select: { periodoId: true, afiliacionId: true, estado: true },
  });
  if (!liq) return;
  if (liq.estado === 'PAGADA') return; // no pisar pagadas

  await persistirLiquidacion(prisma, {
    periodoId: liq.periodoId,
    afiliacionId: liq.afiliacionId,
  });
  revalidatePath('/admin/transacciones');
}

/**
 * Cambia el estado de una liquidación (BORRADOR → REVISADA y viceversa).
 */
export async function marcarRevisadaAction(
  liquidacionId: string,
  revisada: boolean,
) {
  await requireAdmin();
  await prisma.liquidacion.update({
    where: { id: liquidacionId },
    data: { estado: revisada ? 'REVISADA' : 'BORRADOR' },
  });
  revalidatePath('/admin/transacciones');
}
