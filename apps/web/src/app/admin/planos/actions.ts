'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import type { TipoPlanilla } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { nextPlanillaConsecutivo } from '@/lib/consecutivo';

export type ActionState = { error?: string; ok?: boolean; mensaje?: string };

async function currentUserId(): Promise<string | null> {
  const { auth } = await import('@/auth');
  const session = await auth();
  return session?.user?.id ?? null;
}

// ============ Consolidado → Planillas ============

/**
 * Recorre los comprobantes del período dado que:
 *   - están procesados (procesadoEn != null)
 *   - no están anulados
 *   - no están ya enlazados a una planilla activa
 *
 * Agrupa así:
 *   - DEPENDIENTE → 1 planilla tipo E por empresa-planilla + periodoAporte
 *   - INDEPENDIENTE → 1 planilla tipo I por cotizante + periodoAporte
 *
 * Respeta `periodoAporteAnio/Mes` (clave para el desfase del independiente
 * VENCIDO — factura en mes siguiente pero cotiza por el anterior).
 *
 * Los comprobantes con modalidades mixtas (muy raro) se procesan por la
 * modalidad de su PRIMERA liquidación.
 */
export async function generarPlanillasAction(
  periodoId: string,
): Promise<ActionState> {
  await requireAdmin();
  const userId = await currentUserId();

  const periodo = await prisma.periodoContable.findUnique({
    where: { id: periodoId },
  });
  if (!periodo) return { error: 'Período no existe' };

  // Comprobantes del período listos para planilla
  const comps = await prisma.comprobante.findMany({
    where: {
      periodoId,
      procesadoEn: { not: null },
      estado: { not: 'ANULADO' },
      planillas: { none: {} }, // sin planilla activa (ANULADA borra los links en cascade)
    },
    include: {
      liquidaciones: {
        include: {
          liquidacion: {
            select: {
              periodoAporteAnio: true,
              periodoAporteMes: true,
              afiliacion: {
                select: {
                  id: true,
                  modalidad: true,
                  empresaId: true,
                  cotizanteId: true,
                },
              },
              totalGeneral: true,
              conceptos: {
                select: {
                  concepto: true,
                  subconcepto: true,
                  valor: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (comps.length === 0) {
    return { error: 'No hay comprobantes pendientes en este período' };
  }

  // ------ Agrupación ------
  type Totales = {
    salud: number;
    pension: number;
    arl: number;
    ccf: number;
    sena: number;
    icbf: number;
    fsp: number;
    general: number;
  };

  type Bucket = {
    tipoPlanilla: TipoPlanilla;
    empresaId: string | null;
    cotizanteId: string | null;
    periodoAporteAnio: number;
    periodoAporteMes: number;
    comprobanteIds: string[];
    cotizantesSet: Set<string>;
    totales: Totales;
  };

  const newTotales = (): Totales => ({
    salud: 0,
    pension: 0,
    arl: 0,
    ccf: 0,
    sena: 0,
    icbf: 0,
    fsp: 0,
    general: 0,
  });

  const buckets = new Map<string, Bucket>();
  const sinAgrupar: { comprobanteId: string; motivo: string }[] = [];

  for (const comp of comps) {
    const primera = comp.liquidaciones[0]?.liquidacion;
    if (!primera) {
      sinAgrupar.push({
        comprobanteId: comp.id,
        motivo: 'comprobante sin liquidaciones',
      });
      continue;
    }
    const af = primera.afiliacion;
    const paAnio = primera.periodoAporteAnio ?? periodo.anio;
    const paMes = primera.periodoAporteMes ?? periodo.mes;

    let key: string;
    let bucketBase: Omit<Bucket, 'comprobanteIds' | 'cotizantesSet' | 'totales'>;

    if (af.modalidad === 'DEPENDIENTE') {
      if (!af.empresaId) {
        sinAgrupar.push({
          comprobanteId: comp.id,
          motivo: 'dependiente sin empresa-planilla',
        });
        continue;
      }
      key = `E|${af.empresaId}|${paAnio}-${paMes}`;
      bucketBase = {
        tipoPlanilla: 'E',
        empresaId: af.empresaId,
        cotizanteId: null,
        periodoAporteAnio: paAnio,
        periodoAporteMes: paMes,
      };
    } else if (af.modalidad === 'INDEPENDIENTE') {
      // El cotizante puede venir del comprobante (INDIVIDUAL) o de la
      // afiliación (cuando es EMPRESA_CC/ASESOR de una persona).
      const cotId = comp.cotizanteId ?? af.cotizanteId;
      if (!cotId) {
        sinAgrupar.push({
          comprobanteId: comp.id,
          motivo: 'independiente sin cotizante',
        });
        continue;
      }
      key = `I|${cotId}|${paAnio}-${paMes}`;
      bucketBase = {
        tipoPlanilla: 'I',
        empresaId: null,
        cotizanteId: cotId,
        periodoAporteAnio: paAnio,
        periodoAporteMes: paMes,
      };
    } else {
      sinAgrupar.push({
        comprobanteId: comp.id,
        motivo: `modalidad desconocida: ${af.modalidad}`,
      });
      continue;
    }

    let b = buckets.get(key);
    if (!b) {
      b = {
        ...bucketBase,
        comprobanteIds: [],
        cotizantesSet: new Set(),
        totales: newTotales(),
      };
      buckets.set(key, b);
    }

    b.comprobanteIds.push(comp.id);

    // Rastrear cotizantes únicos y acumular totales por subsistema
    for (const cl of comp.liquidaciones) {
      const liq = cl.liquidacion;
      if (liq.afiliacion.cotizanteId) {
        b.cotizantesSet.add(liq.afiliacion.cotizanteId);
      }
      for (const con of liq.conceptos) {
        // Ignorar conceptos internos (CCF $100, ARL 1 día): NO van al
        // operador PILA, son ingreso del aliado. Se identifican por
        // "interno" en el subconcepto.
        const interno =
          con.subconcepto?.toLowerCase().includes('interno') ?? false;
        if (interno) continue;
        const v = Number(con.valor);
        switch (con.concepto) {
          case 'EPS':
            b.totales.salud += v;
            break;
          case 'AFP':
            b.totales.pension += v;
            break;
          case 'ARL':
            b.totales.arl += v;
            break;
          case 'CCF':
            b.totales.ccf += v;
            break;
          case 'SENA':
            b.totales.sena += v;
            break;
          case 'ICBF':
            b.totales.icbf += v;
            break;
          case 'FSP':
            b.totales.fsp += v;
            break;
          // ADMIN / SERVICIO / otros: NO van a la planilla PILA
          default:
            break;
        }
      }
    }
  }

  if (buckets.size === 0) {
    return {
      error:
        sinAgrupar.length > 0
          ? `No se pudo agrupar ningún comprobante (${sinAgrupar.length} con error)`
          : 'No hay comprobantes elegibles',
    };
  }

  // ------ Crear planillas ------
  let creadas = 0;
  const errores: { key: string; mensaje: string }[] = [];

  for (const [key, b] of buckets.entries()) {
    try {
      const consecutivo = await nextPlanillaConsecutivo();
      const total =
        b.totales.salud +
        b.totales.pension +
        b.totales.arl +
        b.totales.ccf +
        b.totales.sena +
        b.totales.icbf +
        b.totales.fsp;

      await prisma.planilla.create({
        data: {
          periodoId,
          consecutivo,
          tipoPlanilla: b.tipoPlanilla,
          empresaId: b.empresaId,
          cotizanteId: b.cotizanteId,
          periodoAporteAnio: b.periodoAporteAnio,
          periodoAporteMes: b.periodoAporteMes,
          totalSalud: b.totales.salud,
          totalPension: b.totales.pension,
          totalArl: b.totales.arl,
          totalCcf: b.totales.ccf,
          totalSena: b.totales.sena,
          totalIcbf: b.totales.icbf,
          totalFsp: b.totales.fsp,
          totalGeneral: total,
          cantidadCotizantes: b.cotizantesSet.size,
          createdById: userId,
          comprobantes: {
            create: b.comprobanteIds.map((cid) => ({ comprobanteId: cid })),
          },
        },
      });
      creadas++;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      errores.push({ key, mensaje });
      console.error(`[generarPlanillas] bucket=${key} error:`, mensaje);
    }
  }

  // Log de errores para trazabilidad
  if (errores.length > 0 || sinAgrupar.length > 0) {
    await prisma.auditLog.create({
      data: {
        entidad: 'Planilla',
        entidadId: periodoId,
        accion: 'GENERAR_PLANILLAS_ERRORES',
        userId,
        descripcion: `${errores.length} errores al crear + ${sinAgrupar.length} comprobantes sin agrupar`,
        cambios: { errores, sinAgrupar },
      },
    });
  }

  revalidatePath('/admin/planos');

  const partes: string[] = [`${creadas} planillas generadas`];
  if (sinAgrupar.length > 0) {
    partes.push(`${sinAgrupar.length} comprobantes sin agrupar`);
  }
  if (errores.length > 0) {
    partes.push(`${errores.length} con error`);
  }
  return { ok: true, mensaje: partes.join(' · ') };
}

// ============ Anular planilla ============

/**
 * Anula una planilla CONSOLIDADO: borra las filas de PlanillaComprobante
 * (cascade), liberando los comprobantes para que vuelvan a agruparse.
 * No se puede anular una planilla PAGADA.
 */
export async function anularPlanillaAction(
  planillaId: string,
): Promise<ActionState> {
  await requireAdmin();

  const planilla = await prisma.planilla.findUnique({
    where: { id: planillaId },
    select: { estado: true },
  });
  if (!planilla) return { error: 'Planilla no existe' };
  if (planilla.estado === 'PAGADA') {
    return { error: 'No se puede anular una planilla ya pagada' };
  }
  if (planilla.estado === 'ANULADA') {
    return { error: 'La planilla ya está anulada' };
  }

  // Cascade borra las filas de PlanillaComprobante, liberando los
  // comprobantes para re-agruparse en una nueva generación.
  await prisma.planilla.update({
    where: { id: planillaId },
    data: {
      estado: 'ANULADA',
      comprobantes: { deleteMany: {} },
    },
  });

  revalidatePath('/admin/planos');
  return { ok: true, mensaje: 'Planilla anulada — comprobantes liberados' };
}
