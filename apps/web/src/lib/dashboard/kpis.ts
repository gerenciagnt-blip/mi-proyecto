import { prisma } from '@pila/db';

/**
 * Cálculo de KPIs ejecutivos por sucursal y período.
 *
 * Diseño:
 *   - Una sola función `cargarKpis()` que dispara todos los counts en
 *     paralelo (Promise.all) para minimizar la latencia.
 *   - Compara el período actual contra el anterior y calcula el delta
 *     porcentual para mostrarlo como "+12%" o "-5%".
 *   - Si `sucursalId` es null/undefined → consolidado de todas las
 *     sucursales (solo staff). Si es un id concreto, scope a esa.
 *
 * Las queries son agregaciones simples sobre tablas con índices en
 * `sucursalId`, `estado`, `createdAt`, `procesadoEn`, etc. — no hay
 * N+1 ni full scans.
 */

export type KpiValor = {
  /** Valor del período actual. */
  actual: number;
  /** Valor del período anterior (para comparar). */
  anterior: number;
  /** Delta porcentual (actual vs anterior). null si anterior=0. */
  deltaPct: number | null;
};

export type KpisDashboard = {
  /** Cotizantes activos en la sucursal (no filtra por período). */
  cotizantes: number;
  /** Afiliaciones con estado=ACTIVA (no filtra por período). */
  afiliacionesActivas: number;

  /** Comprobantes procesados en el período. */
  comprobantesProcesados: KpiValor;
  /** Suma de totalGeneral de comprobantes del período (en pesos). */
  totalFacturado: KpiValor;

  /** Valor de cartera MORA_REAL + CARTERA_REAL pendiente (snapshot, no por período). */
  carteraPendienteValor: number;
  /** Cartera pagada en el período (PAGADA_CARTERA_REAL con updatedAt en el período). */
  carteraPagadaValor: KpiValor;

  /** Incapacidades en estados activos (no filtra por período). */
  incapacidadesActivas: number;
  /** Nuevas radicaciones en el período. */
  incapacidadesRadicadas: KpiValor;
  /**
   * Tiempo promedio (días) de resolución de las cerradas en los últimos
   * 90 días. Null si no hay datos suficientes.
   */
  tiempoPromedioResolucionDias: number | null;

  /** Planillas con estado=PAGADA y pagadoEn en el período. */
  planillasPagadas: KpiValor;
};

/** Calcula delta porcentual con manejo defensivo cuando anterior=0. */
function delta(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null; // creció desde cero — incomparable
  return Math.round(((actual - anterior) / anterior) * 100);
}

/** Rango UTC del período contable (mes calendario). */
function rangoMes(anio: number, mes: number): { inicio: Date; fin: Date } {
  const inicio = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0));
  const fin = new Date(Date.UTC(anio, mes, 0, 23, 59, 59, 999));
  return { inicio, fin };
}

/** Período inmediatamente anterior. */
function periodoAnterior(anio: number, mes: number): { anio: number; mes: number } {
  if (mes === 1) return { anio: anio - 1, mes: 12 };
  return { anio, mes: mes - 1 };
}

export type CargarKpisOpts = {
  /** Si es null, consolida todas las sucursales (solo staff). */
  sucursalId: string | null;
  /** Período contable a analizar. */
  anio: number;
  mes: number;
};

export async function cargarKpis(opts: CargarKpisOpts): Promise<KpisDashboard> {
  const { sucursalId, anio, mes } = opts;
  const { inicio, fin } = rangoMes(anio, mes);
  const ant = periodoAnterior(anio, mes);
  const { inicio: inicioAnt, fin: finAnt } = rangoMes(ant.anio, ant.mes);

  const sucursalFilter = sucursalId ? { sucursalId } : {};

  // Filtro de comprobantes por sucursal (un comprobante apunta a uno de
  // tres: cotizante, cuentaCobro, asesorComercial).
  const compSucursalFilter = sucursalId
    ? {
        OR: [
          { cotizante: { sucursalId } },
          { cuentaCobro: { sucursalId } },
          { asesorComercial: { OR: [{ sucursalId: null }, { sucursalId }] } },
        ],
      }
    : {};

  const [
    cotizantes,
    afiliacionesActivas,
    compProcesadosAct,
    compProcesadosAnt,
    totalFacturadoAct,
    totalFacturadoAnt,
    carteraPendiente,
    carteraPagadaAct,
    carteraPagadaAnt,
    incapActivas,
    incapRadicadasAct,
    incapRadicadasAnt,
    cerradasUlt90,
    planillasPagadasAct,
    planillasPagadasAnt,
  ] = await Promise.all([
    // 1. Cotizantes (snapshot)
    prisma.cotizante.count({ where: sucursalFilter }),

    // 2. Afiliaciones activas (snapshot via cotizante)
    prisma.afiliacion.count({
      where: {
        estado: 'ACTIVA',
        ...(sucursalId ? { cotizante: { sucursalId } } : {}),
      },
    }),

    // 3. Comprobantes procesados (actual)
    prisma.comprobante.count({
      where: {
        procesadoEn: { gte: inicio, lte: fin, not: null },
        estado: { not: 'ANULADO' },
        ...compSucursalFilter,
      },
    }),
    // 3b. Comprobantes procesados (anterior)
    prisma.comprobante.count({
      where: {
        procesadoEn: { gte: inicioAnt, lte: finAnt, not: null },
        estado: { not: 'ANULADO' },
        ...compSucursalFilter,
      },
    }),

    // 4. Total facturado (actual) — suma totalGeneral
    prisma.comprobante.aggregate({
      where: {
        procesadoEn: { gte: inicio, lte: fin, not: null },
        estado: { not: 'ANULADO' },
        ...compSucursalFilter,
      },
      _sum: { totalGeneral: true },
    }),
    // 4b. Total facturado (anterior)
    prisma.comprobante.aggregate({
      where: {
        procesadoEn: { gte: inicioAnt, lte: finAnt, not: null },
        estado: { not: 'ANULADO' },
        ...compSucursalFilter,
      },
      _sum: { totalGeneral: true },
    }),

    // 5. Cartera pendiente (snapshot, no por período)
    prisma.carteraDetallado.aggregate({
      where: {
        estado: { in: ['MORA_REAL', 'CARTERA_REAL'] },
        ...(sucursalId ? { sucursalAsignadaId: sucursalId } : {}),
      },
      _sum: { valorCobro: true },
    }),

    // 6. Cartera pagada en el período (actual)
    prisma.carteraDetallado.aggregate({
      where: {
        estado: 'PAGADA_CARTERA_REAL',
        updatedAt: { gte: inicio, lte: fin },
        ...(sucursalId ? { sucursalAsignadaId: sucursalId } : {}),
      },
      _sum: { valorCobro: true },
    }),
    // 6b. Cartera pagada (anterior)
    prisma.carteraDetallado.aggregate({
      where: {
        estado: 'PAGADA_CARTERA_REAL',
        updatedAt: { gte: inicioAnt, lte: finAnt },
        ...(sucursalId ? { sucursalAsignadaId: sucursalId } : {}),
      },
      _sum: { valorCobro: true },
    }),

    // 7. Incapacidades activas (snapshot)
    prisma.incapacidad.count({
      where: {
        estado: { in: ['RADICADA', 'EN_REVISION', 'APROBADA'] },
        ...sucursalFilter,
      },
    }),

    // 8. Incapacidades radicadas en el período (actual)
    prisma.incapacidad.count({
      where: {
        fechaRadicacion: { gte: inicio, lte: fin },
        ...sucursalFilter,
      },
    }),
    // 8b. Anterior
    prisma.incapacidad.count({
      where: {
        fechaRadicacion: { gte: inicioAnt, lte: finAnt },
        ...sucursalFilter,
      },
    }),

    // 9. Tiempo promedio resolución (incapacidades cerradas en 90d).
    //    Traemos el listado y calculamos en JS (más simple que SQL puro
    //    sobre la bitácora de gestiones).
    prisma.incapacidad.findMany({
      where: {
        estado: { in: ['PAGADA', 'RECHAZADA'] },
        ...sucursalFilter,
        gestiones: {
          some: {
            nuevoEstado: { in: ['PAGADA', 'RECHAZADA'] },
            createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
        },
      },
      take: 500, // tope defensivo
      select: {
        fechaRadicacion: true,
        gestiones: {
          where: { nuevoEstado: { in: ['PAGADA', 'RECHAZADA'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),

    // 10. Planillas pagadas en el período (actual)
    prisma.planilla.count({
      where: {
        estado: 'PAGADA',
        pagadoEn: { gte: inicio, lte: fin },
        ...sucursalFilter,
      },
    }),
    // 10b. Anterior
    prisma.planilla.count({
      where: {
        estado: 'PAGADA',
        pagadoEn: { gte: inicioAnt, lte: finAnt },
        ...sucursalFilter,
      },
    }),
  ]);

  // Cálculo del promedio en JS
  let tiempoPromedioResolucionDias: number | null = null;
  if (cerradasUlt90.length > 0) {
    const dias = cerradasUlt90
      .map((i) => {
        const cierre = i.gestiones[0]?.createdAt;
        if (!cierre) return null;
        const ms = cierre.getTime() - i.fechaRadicacion.getTime();
        return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
      })
      .filter((x): x is number => x != null);
    if (dias.length > 0) {
      tiempoPromedioResolucionDias = Math.round(dias.reduce((s, n) => s + n, 0) / dias.length);
    }
  }

  return {
    cotizantes,
    afiliacionesActivas,

    comprobantesProcesados: {
      actual: compProcesadosAct,
      anterior: compProcesadosAnt,
      deltaPct: delta(compProcesadosAct, compProcesadosAnt),
    },
    totalFacturado: {
      actual: Number(totalFacturadoAct._sum.totalGeneral ?? 0),
      anterior: Number(totalFacturadoAnt._sum.totalGeneral ?? 0),
      deltaPct: delta(
        Number(totalFacturadoAct._sum.totalGeneral ?? 0),
        Number(totalFacturadoAnt._sum.totalGeneral ?? 0),
      ),
    },

    carteraPendienteValor: Number(carteraPendiente._sum.valorCobro ?? 0),
    carteraPagadaValor: {
      actual: Number(carteraPagadaAct._sum.valorCobro ?? 0),
      anterior: Number(carteraPagadaAnt._sum.valorCobro ?? 0),
      deltaPct: delta(
        Number(carteraPagadaAct._sum.valorCobro ?? 0),
        Number(carteraPagadaAnt._sum.valorCobro ?? 0),
      ),
    },

    incapacidadesActivas: incapActivas,
    incapacidadesRadicadas: {
      actual: incapRadicadasAct,
      anterior: incapRadicadasAnt,
      deltaPct: delta(incapRadicadasAct, incapRadicadasAnt),
    },
    tiempoPromedioResolucionDias,

    planillasPagadas: {
      actual: planillasPagadasAct,
      anterior: planillasPagadasAnt,
      deltaPct: delta(planillasPagadasAct, planillasPagadasAnt),
    },
  };
}
