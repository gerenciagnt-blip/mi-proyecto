'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import type { TipoPlanilla } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { nextPlanillaConsecutivo } from '@/lib/consecutivo';
import {
  planillasParaAfiliacion,
  banderasSubsistemas,
} from '@/lib/planos/politicas';

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
 * Agrupa aplicando la política `planillasParaAfiliacion()`:
 *   - ORDINARIO + DEPENDIENTE    → 1 planilla tipo E por empresa + periodoAporte
 *   - ORDINARIO + INDEPENDIENTE  → 1 planilla tipo I por cotizante + periodoAporte
 *   - RESOLUCION + EPS+ARL       → 2 planillas (E + K) del mismo cotizante
 *   - RESOLUCION + solo ARL      → 1 planilla K por cotizante
 *
 * Un mismo comprobante puede enlazarse a 2 planillas (E+K) simultáneamente
 * gracias a que quitamos el @unique de PlanillaComprobante.comprobanteId.
 *
 * Totales: se suman TODOS los conceptos (reales e "internos") porque los
 * CCF/ARL internos sí van al operador PILA (son el mínimo legal cuando
 * el plan SGSS no incluye ese subsistema). Se filtra además por las
 * banderas del tipo de planilla: tipo E-resolución solo suma EPS; tipo K
 * solo suma ARL.
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
                  regimen: true,
                  empresaId: true,
                  cotizanteId: true,
                  planSgss: {
                    select: {
                      incluyeEps: true,
                      incluyeAfp: true,
                      incluyeArl: true,
                      incluyeCcf: true,
                    },
                  },
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
    comprobanteIds: Set<string>;
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

    // Determinar qué tipos de planilla genera esta afiliación (política)
    const tipos = planillasParaAfiliacion({
      modalidad: af.modalidad,
      regimen: af.regimen,
      plan: af.planSgss,
    });
    if (tipos.length === 0) {
      sinAgrupar.push({
        comprobanteId: comp.id,
        motivo: `modalidad/plan sin tipo de planilla: ${af.modalidad}/${af.regimen}`,
      });
      continue;
    }

    for (const tipo of tipos) {
      let key: string;
      let bucketBase: Omit<
        Bucket,
        'comprobanteIds' | 'cotizantesSet' | 'totales'
      >;

      if (tipo === 'E') {
        // Tipo E agrupa por empresa (dependientes ordinarios). Para
        // RESOLUCIÓN el tipo E se genera a nivel cotizante individual
        // porque el tipo doc se fuerza a PA y no puede mezclarse con
        // dependientes ordinarios de la misma empresa.
        if (af.regimen === 'RESOLUCION') {
          const cotId = comp.cotizanteId ?? af.cotizanteId;
          if (!cotId) {
            sinAgrupar.push({
              comprobanteId: comp.id,
              motivo: 'resolución E sin cotizante',
            });
            continue;
          }
          key = `E-RES|${cotId}|${paAnio}-${paMes}`;
          bucketBase = {
            tipoPlanilla: 'E',
            empresaId: null,
            cotizanteId: cotId,
            periodoAporteAnio: paAnio,
            periodoAporteMes: paMes,
          };
        } else {
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
        }
      } else if (tipo === 'I' || tipo === 'K') {
        const cotId = comp.cotizanteId ?? af.cotizanteId;
        if (!cotId) {
          sinAgrupar.push({
            comprobanteId: comp.id,
            motivo: `${tipo} sin cotizante`,
          });
          continue;
        }
        key = `${tipo}|${cotId}|${paAnio}-${paMes}`;
        bucketBase = {
          tipoPlanilla: tipo,
          empresaId: null,
          cotizanteId: cotId,
          periodoAporteAnio: paAnio,
          periodoAporteMes: paMes,
        };
      } else {
        sinAgrupar.push({
          comprobanteId: comp.id,
          motivo: `tipo de planilla no soportado aún: ${tipo}`,
        });
        continue;
      }

      let b = buckets.get(key);
      if (!b) {
        b = {
          ...bucketBase,
          comprobanteIds: new Set(),
          cotizantesSet: new Set(),
          totales: newTotales(),
        };
        buckets.set(key, b);
      }

      b.comprobanteIds.add(comp.id);

      // Banderas para saber qué subsistemas suma este tipo de planilla
      const banderas = banderasSubsistemas({
        tipoPlanilla: tipo,
        regimen: af.regimen,
      });

      // Rastrear cotizantes únicos y acumular totales (incluyendo internos)
      for (const cl of comp.liquidaciones) {
        const liq = cl.liquidacion;
        if (liq.afiliacion.cotizanteId) {
          b.cotizantesSet.add(liq.afiliacion.cotizanteId);
        }
        for (const con of liq.conceptos) {
          const v = Number(con.valor);
          switch (con.concepto) {
            case 'EPS':
              if (banderas.aplicaEps) b.totales.salud += v;
              break;
            case 'AFP':
              if (banderas.aplicaAfp) b.totales.pension += v;
              break;
            case 'ARL':
              if (banderas.aplicaArl) b.totales.arl += v;
              break;
            case 'CCF':
              if (banderas.aplicaCcf) b.totales.ccf += v;
              break;
            case 'SENA':
              if (banderas.aplicaSenaIcbf) b.totales.sena += v;
              break;
            case 'ICBF':
              if (banderas.aplicaSenaIcbf) b.totales.icbf += v;
              break;
            case 'FSP':
              if (banderas.aplicaAfp) b.totales.fsp += v;
              break;
            // ADMIN / SERVICIO / otros: NO van al operador PILA
            default:
              break;
          }
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
            create: Array.from(b.comprobanteIds).map((cid) => ({
              comprobanteId: cid,
            })),
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

// ============ Marcar como pagada ============

/**
 * Confirma el pago de una planilla: cambia estado a PAGADA, guarda el
 * número oficial que asignó el operador PILA y la fecha de pago, y
 * propaga el `numeroPlanilla` a todos los comprobantes enlazados.
 *
 * Una vez pagada, la planilla no puede anularse.
 */
export async function marcarPlanillaPagadaAction(
  planillaId: string,
  numeroPlanillaExt: string,
  fechaPagoIso: string,
): Promise<ActionState> {
  await requireAdmin();

  const num = numeroPlanillaExt.trim();
  if (!num) return { error: 'El número de planilla es obligatorio' };

  // Parsear fecha como mediodía UTC para evitar corrimiento TZ
  const [y, m, d] = fechaPagoIso.split('-').map(Number);
  if (!y || !m || !d) return { error: 'Fecha de pago inválida' };
  const fechaPago = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  const planilla = await prisma.planilla.findUnique({
    where: { id: planillaId },
    select: {
      estado: true,
      comprobantes: { select: { comprobanteId: true } },
    },
  });
  if (!planilla) return { error: 'Planilla no existe' };
  if (planilla.estado === 'PAGADA') {
    return { error: 'La planilla ya está marcada como pagada' };
  }
  if (planilla.estado === 'ANULADA') {
    return { error: 'La planilla está anulada' };
  }

  const comprobanteIds = planilla.comprobantes.map((c) => c.comprobanteId);

  // Un solo $transaction: actualizar planilla + propagar a comprobantes
  await prisma.$transaction([
    prisma.planilla.update({
      where: { id: planillaId },
      data: {
        estado: 'PAGADA',
        numeroPlanillaExt: num,
        pagadoEn: fechaPago,
      },
    }),
    prisma.comprobante.updateMany({
      where: { id: { in: comprobanteIds } },
      data: { numeroPlanilla: num },
    }),
  ]);

  revalidatePath('/admin/planos');
  revalidatePath('/admin/transacciones');
  revalidatePath('/admin/transacciones/historial');
  return { ok: true, mensaje: `Planilla ${num} marcada como pagada` };
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
