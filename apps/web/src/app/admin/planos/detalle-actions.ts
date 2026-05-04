'use server';

/**
 * Server actions para el modal "Detalle" del módulo Planos.
 *
 * Dos casos:
 *
 *   1. Planilla existente (Guardado / Validación / Pagadas) — tomamos
 *      `planillaId` y resolvemos via `comprobantes → liquidaciones →
 *      afiliacion + cotizante`.
 *
 *   2. Grupo en preview (Consolidado, antes de generar) — tomamos
 *      `{ periodoId, tipo, aportanteId, periodoAporteAnio/Mes }` y
 *      filtramos los comprobantes pendientes que aún no tienen planilla.
 *
 * Ambos endpoints respetan el sucursal-scope: aliados sólo ven los
 * cotizantes de su sucursal; staff ve todo (con filtro opcional ya
 * aplicado upstream en la página).
 */

import { Prisma, prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';

export type CotizanteConcepto = {
  concepto: string;
  subconcepto: string | null;
  base: number;
  porcentaje: number;
  valor: number;
  aCargoEmpleador: boolean;
};

export type CotizanteDetalleRow = {
  cotizanteId: string;
  afiliacionId: string;
  liquidacionId: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombreCompleto: string;
  modalidad: string;
  empresaNombre: string | null;
  empresaNit: string | null;
  periodoAporteAnio: number | null;
  periodoAporteMes: number | null;
  diasCotizados: number;
  diaDesde: number | null;
  diaHasta: number | null;
  ibc: number;
  totalEmpleador: number;
  totalTrabajador: number;
  totalGeneral: number;
  eps: string | null;
  afp: string | null;
  arl: string | null;
  ccf: string | null;
  conceptos: CotizanteConcepto[];
};

const LIQUIDACION_INCLUDE = {
  conceptos: true,
  afiliacion: {
    include: {
      cotizante: {
        select: {
          id: true,
          tipoDocumento: true,
          numeroDocumento: true,
          primerNombre: true,
          segundoNombre: true,
          primerApellido: true,
          segundoApellido: true,
        },
      },
      empresa: { select: { nombre: true, nit: true } },
      eps: { select: { nombre: true } },
      afp: { select: { nombre: true } },
      arl: { select: { nombre: true } },
      ccf: { select: { nombre: true } },
    },
  },
} satisfies Prisma.LiquidacionInclude;

type LiquidacionFull = Prisma.LiquidacionGetPayload<{ include: typeof LIQUIDACION_INCLUDE }>;

function mapLiquidacionToRow(liq: LiquidacionFull): CotizanteDetalleRow {
  const af = liq.afiliacion;
  const cot = af.cotizante;
  const nombreCompleto = [
    cot.primerNombre,
    cot.segundoNombre,
    cot.primerApellido,
    cot.segundoApellido,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    cotizanteId: cot.id,
    afiliacionId: af.id,
    liquidacionId: liq.id,
    tipoDocumento: cot.tipoDocumento,
    numeroDocumento: cot.numeroDocumento,
    nombreCompleto,
    modalidad: af.modalidad,
    empresaNombre: af.empresa?.nombre ?? null,
    empresaNit: af.empresa?.nit ?? null,
    periodoAporteAnio: liq.periodoAporteAnio,
    periodoAporteMes: liq.periodoAporteMes,
    diasCotizados: liq.diasCotizados,
    diaDesde: liq.diaDesde,
    diaHasta: liq.diaHasta,
    ibc: Number(liq.ibc),
    totalEmpleador: Number(liq.totalEmpleador),
    totalTrabajador: Number(liq.totalTrabajador),
    totalGeneral: Number(liq.totalGeneral),
    eps: af.eps?.nombre ?? null,
    afp: af.afp?.nombre ?? null,
    arl: af.arl?.nombre ?? null,
    ccf: af.ccf?.nombre ?? null,
    conceptos: liq.conceptos.map((c) => ({
      concepto: c.concepto,
      subconcepto: c.subconcepto,
      base: Number(c.base),
      porcentaje: Number(c.porcentaje),
      valor: Number(c.valor),
      aCargoEmpleador: c.aCargoEmpleador,
    })),
  };
}

/**
 * Detalle de una planilla ya generada. Resuelve los cotizantes que
 * fueron incluidos via `PlanillaComprobante → Comprobante →
 * ComprobanteLiquidacion → Liquidacion`.
 */
export async function getDetallePlanillaAction(planillaId: string): Promise<CotizanteDetalleRow[]> {
  await requireAuth();
  const scope = await getUserScope();

  // Verificación de scope: si el user es de sucursal, la planilla debe
  // pertenecer a su sucursal. Si no, devolvemos [] (no expone nada).
  const planilla = await prisma.planilla.findUnique({
    where: { id: planillaId },
    select: { id: true, sucursalId: true },
  });
  if (!planilla) return [];
  if (scope?.tipo === 'SUCURSAL' && planilla.sucursalId !== scope.sucursalId) {
    return [];
  }

  // Resolver liquidaciones únicas asociadas a la planilla.
  // Una liquidación puede aparecer en varios comprobantes (raro, pero
  // posible) — dedup por liquidacionId.
  const planillaConDatos = await prisma.planilla.findUnique({
    where: { id: planillaId },
    include: {
      comprobantes: {
        include: {
          comprobante: {
            include: {
              liquidaciones: {
                include: {
                  liquidacion: { include: LIQUIDACION_INCLUDE },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!planillaConDatos) return [];

  const seen = new Set<string>();
  const rows: CotizanteDetalleRow[] = [];
  for (const pc of planillaConDatos.comprobantes) {
    for (const cl of pc.comprobante.liquidaciones) {
      const liq = cl.liquidacion;
      if (seen.has(liq.id)) continue;
      seen.add(liq.id);
      rows.push(mapLiquidacionToRow(liq));
    }
  }
  rows.sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
  return rows;
}

/**
 * Detalle de un grupo en preview (Consolidado). Recibe el aportante
 * + período aporte y devuelve las liquidaciones de los comprobantes
 * pendientes de planilla para ese grupo.
 */
export async function getDetalleGrupoConsolidadoAction(params: {
  periodoId: string;
  tipo: 'E' | 'I';
  aportanteId: string;
  periodoAporteAnio: number;
  periodoAporteMes: number;
}): Promise<CotizanteDetalleRow[]> {
  await requireAuth();
  const scope = await getUserScope();

  // Filtro de scope sobre comprobantes (mismo OR que en page.tsx).
  const compScopeOR: Prisma.ComprobanteWhereInput[] =
    scope?.tipo === 'SUCURSAL'
      ? [
          { cotizante: { sucursalId: scope.sucursalId } },
          { cuentaCobro: { sucursalId: scope.sucursalId } },
          {
            asesorComercial: {
              OR: [{ sucursalId: null }, { sucursalId: scope.sucursalId }],
            },
          },
        ]
      : [];

  // Filtrar liquidaciones del período aporte que estén dentro de
  // comprobantes pendientes del aportante. La modalidad determina el
  // criterio: tipo=E → filtramos por afiliacion.empresaId; tipo=I →
  // por afiliacion.cotizanteId (el mismo cotizante es el aportante).
  const afiliacionFilter: Prisma.AfiliacionWhereInput =
    params.tipo === 'E'
      ? { modalidad: 'DEPENDIENTE', empresaId: params.aportanteId }
      : { modalidad: 'INDEPENDIENTE', cotizanteId: params.aportanteId };

  const liquidaciones = await prisma.liquidacion.findMany({
    where: {
      periodoAporteAnio: params.periodoAporteAnio,
      periodoAporteMes: params.periodoAporteMes,
      afiliacion: afiliacionFilter,
      // Solo las que están en comprobantes pendientes (sin planilla y
      // procesados). Mismo filtro que TabConsolidado de page.tsx.
      comprobantes: {
        some: {
          comprobante: {
            periodoId: params.periodoId,
            procesadoEn: { not: null },
            estado: { not: 'ANULADO' },
            planillas: { none: {} },
            ...(compScopeOR.length > 0 ? { OR: compScopeOR } : {}),
          },
        },
      },
    },
    include: LIQUIDACION_INCLUDE,
  });

  const rows = liquidaciones.map(mapLiquidacionToRow);
  rows.sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
  return rows;
}
