'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { persistirLiquidacion } from '@/lib/liquidacion/calcular';
import { nextComprobanteConsecutivo } from '@/lib/consecutivo';

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

// ============ Comprobantes (Fase 3.2) ============

/**
 * Genera (o regenera) los comprobantes del período a partir de sus
 * liquidaciones. Los comprobantes EMITIDOS/PAGADOS no se tocan.
 *
 * Produce tres sets:
 *   1. AFILIACION · INDIVIDUAL     → uno por cada liquidación VINCULACION
 *   2. MENSUALIDAD · EMPRESA_CC    → uno por cuenta de cobro con liquidaciones
 *                                    MENSUALIDAD (agrupadas por cuentaCobroId)
 *   3. MENSUALIDAD · INDIVIDUAL    → uno por cotizante sin cuenta de cobro
 *   4. MENSUALIDAD · ASESOR_COMERCIAL → uno por asesor con liquidaciones
 *                                    asignadas (reporte/comisión — informativo)
 */
export async function generarComprobantesPeriodoAction(
  periodoId: string,
): Promise<ActionState> {
  await requireAdmin();

  const periodo = await prisma.periodoContable.findUnique({ where: { id: periodoId } });
  if (!periodo) return { error: 'Período no existe' };
  if (periodo.estado === 'CERRADO') return { error: 'Período cerrado — reabrir primero' };

  const liquidaciones = await prisma.liquidacion.findMany({
    where: { periodoId },
    include: {
      afiliacion: {
        select: {
          id: true,
          cotizanteId: true,
          cuentaCobroId: true,
          asesorComercialId: true,
        },
      },
    },
  });
  if (liquidaciones.length === 0) {
    return { error: 'No hay liquidaciones — corre "Liquidar período" primero' };
  }

  // Borra comprobantes del período que estén en BORRADOR (se regeneran).
  // Los EMITIDOS/PAGADOS se respetan.
  await prisma.comprobante.deleteMany({
    where: { periodoId, estado: 'BORRADOR' },
  });

  let creados = 0;

  // ---- 1) AFILIACION · INDIVIDUAL por cada VINCULACION ----
  const vinculaciones = liquidaciones.filter((l) => l.tipo === 'VINCULACION');
  for (const l of vinculaciones) {
    const consecutivo = await nextComprobanteConsecutivo();
    await prisma.comprobante.create({
      data: {
        periodoId,
        tipo: 'AFILIACION',
        agrupacion: 'INDIVIDUAL',
        consecutivo,
        cotizanteId: l.afiliacion.cotizanteId,
        totalEmpleador: l.totalEmpleador,
        totalTrabajador: l.totalTrabajador,
        totalGeneral: l.totalGeneral,
        liquidaciones: { create: [{ liquidacionId: l.id }] },
      },
    });
    creados++;
  }

  // ---- 2 & 3) MENSUALIDAD ----
  const mensualidades = liquidaciones.filter((l) => l.tipo === 'MENSUALIDAD');

  // Agrupa por cuentaCobroId (las que tienen CC)
  const porCC = new Map<string, typeof mensualidades>();
  const individuales: typeof mensualidades = [];
  for (const l of mensualidades) {
    if (l.afiliacion.cuentaCobroId) {
      const key = l.afiliacion.cuentaCobroId;
      const arr = porCC.get(key) ?? [];
      arr.push(l);
      porCC.set(key, arr);
    } else {
      individuales.push(l);
    }
  }

  for (const [cuentaCobroId, liqs] of porCC) {
    const totales = liqs.reduce(
      (acc, l) => {
        acc.empleador += Number(l.totalEmpleador);
        acc.trabajador += Number(l.totalTrabajador);
        acc.general += Number(l.totalGeneral);
        return acc;
      },
      { empleador: 0, trabajador: 0, general: 0 },
    );
    const consecutivo = await nextComprobanteConsecutivo();
    await prisma.comprobante.create({
      data: {
        periodoId,
        tipo: 'MENSUALIDAD',
        agrupacion: 'EMPRESA_CC',
        consecutivo,
        cuentaCobroId,
        totalEmpleador: totales.empleador,
        totalTrabajador: totales.trabajador,
        totalGeneral: totales.general,
        liquidaciones: {
          create: liqs.map((l) => ({ liquidacionId: l.id })),
        },
      },
    });
    creados++;
  }

  for (const l of individuales) {
    const consecutivo = await nextComprobanteConsecutivo();
    await prisma.comprobante.create({
      data: {
        periodoId,
        tipo: 'MENSUALIDAD',
        agrupacion: 'INDIVIDUAL',
        consecutivo,
        cotizanteId: l.afiliacion.cotizanteId,
        totalEmpleador: l.totalEmpleador,
        totalTrabajador: l.totalTrabajador,
        totalGeneral: l.totalGeneral,
        liquidaciones: { create: [{ liquidacionId: l.id }] },
      },
    });
    creados++;
  }

  // ---- 4) MENSUALIDAD · ASESOR_COMERCIAL (informativo/comisión) ----
  // Agrupa TODAS las liquidaciones del período (vinculación + mensualidad)
  // cuyas afiliaciones apunten al mismo asesor.
  const porAsesor = new Map<string, typeof liquidaciones>();
  for (const l of liquidaciones) {
    const aid = l.afiliacion.asesorComercialId;
    if (!aid) continue;
    const arr = porAsesor.get(aid) ?? [];
    arr.push(l);
    porAsesor.set(aid, arr);
  }
  for (const [asesorComercialId, liqs] of porAsesor) {
    const totales = liqs.reduce(
      (acc, l) => {
        acc.empleador += Number(l.totalEmpleador);
        acc.trabajador += Number(l.totalTrabajador);
        acc.general += Number(l.totalGeneral);
        return acc;
      },
      { empleador: 0, trabajador: 0, general: 0 },
    );
    const consecutivo = await nextComprobanteConsecutivo();
    await prisma.comprobante.create({
      data: {
        periodoId,
        tipo: 'MENSUALIDAD',
        agrupacion: 'ASESOR_COMERCIAL',
        consecutivo,
        asesorComercialId,
        totalEmpleador: totales.empleador,
        totalTrabajador: totales.trabajador,
        totalGeneral: totales.general,
        observaciones: 'Reporte informativo — las liquidaciones cobran por su comprobante individual o de CC',
        liquidaciones: {
          create: liqs.map((l) => ({ liquidacionId: l.id })),
        },
      },
    });
    creados++;
  }

  revalidatePath('/admin/transacciones');
  revalidatePath('/admin/transacciones/comprobantes');
  return { ok: true, mensaje: `${creados} comprobante${creados === 1 ? '' : 's'} generado${creados === 1 ? '' : 's'}` };
}

export async function marcarComprobanteEmitidoAction(comprobanteId: string) {
  await requireAdmin();
  const c = await prisma.comprobante.findUnique({ where: { id: comprobanteId } });
  if (!c) return;
  const next = c.estado === 'BORRADOR' ? 'EMITIDO' : 'BORRADOR';
  await prisma.comprobante.update({
    where: { id: comprobanteId },
    data: {
      estado: next,
      emitidoEn: next === 'EMITIDO' ? new Date() : null,
    },
  });
  revalidatePath('/admin/transacciones/comprobantes');
}

export async function anularComprobanteAction(comprobanteId: string) {
  await requireAdmin();
  await prisma.comprobante.update({
    where: { id: comprobanteId },
    data: { estado: 'ANULADO' },
  });
  revalidatePath('/admin/transacciones/comprobantes');
}
