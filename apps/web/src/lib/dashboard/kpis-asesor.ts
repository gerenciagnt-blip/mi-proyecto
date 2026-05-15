import { prisma } from '@pila/db';

/**
 * Sprint Asesor Comercial — KPIs personales del asesor.
 *
 * A diferencia de `cargarKpis` (que es por sucursal), este filtra todo
 * por `asesorComercialId` para que cada asesor vea SOLO los números de
 * lo que él vendió/gestiona.
 *
 * Las queries:
 *   - Afiliaciones: directo con `asesorComercialId = X`.
 *   - Cotizantes únicos: cotizantes con al menos una afiliación del
 *     asesor.
 *   - Cartera: vía cotizante (la línea no tiene FK directa a asesor;
 *     un cotizante puede tener varias afiliaciones con asesores
 *     distintos, en cuyo caso la línea aparece para todos. Conservador
 *     y previsible — se afina si hace falta).
 */

export type KpiValor = {
  actual: number;
  anterior: number;
  deltaPct: number | null;
};

export type KpisAsesor = {
  /** Cotizantes únicos con al menos una afiliación gestionada por el asesor. */
  misCotizantes: number;
  /** Afiliaciones ACTIVAS donde el asesor es el responsable. */
  misAfiliacionesActivas: number;
  /** Nuevas afiliaciones radicadas por el asesor en el período. */
  misAfiliacionesNuevas: KpiValor;
  /** Valor de cartera MORA_REAL + CARTERA_REAL de cotizantes del asesor. */
  miCarteraPendienteValor: number;
  /** Cartera recuperada (PAGADA) en el período de cotizantes del asesor. */
  miCarteraRecuperadaValor: KpiValor;
};

function delta(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

function rangoMes(anio: number, mes: number): { inicio: Date; fin: Date } {
  const inicio = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0));
  const fin = new Date(Date.UTC(anio, mes, 0, 23, 59, 59, 999));
  return { inicio, fin };
}

function periodoAnterior(anio: number, mes: number): { anio: number; mes: number } {
  if (mes === 1) return { anio: anio - 1, mes: 12 };
  return { anio, mes: mes - 1 };
}

export type CargarKpisAsesorOpts = {
  asesorComercialId: string;
  sucursalId: string;
  anio: number;
  mes: number;
};

export async function cargarKpisAsesor(opts: CargarKpisAsesorOpts): Promise<KpisAsesor> {
  const { asesorComercialId, sucursalId, anio, mes } = opts;
  const { inicio, fin } = rangoMes(anio, mes);
  const ant = periodoAnterior(anio, mes);
  const { inicio: inicioAnt, fin: finAnt } = rangoMes(ant.anio, ant.mes);

  // Filtro común: cotizantes con al menos una afiliación del asesor en
  // su sucursal. Se reutiliza en cartera pendiente y recuperada.
  const cotizanteScopeAsesor = {
    sucursalId,
    afiliaciones: { some: { asesorComercialId } },
  };

  const [
    misCotizantes,
    misAfiliacionesActivas,
    nuevasActual,
    nuevasAnterior,
    miCarteraPendienteAgg,
    miCarteraRecuperadaActualAgg,
    miCarteraRecuperadaAnteriorAgg,
  ] = await Promise.all([
    // Cotizantes únicos del asesor
    prisma.cotizante.count({ where: cotizanteScopeAsesor }),

    // Afiliaciones activas del asesor
    prisma.afiliacion.count({
      where: { asesorComercialId, estado: 'ACTIVA' },
    }),

    // Nuevas afiliaciones del asesor (creadas en el período)
    prisma.afiliacion.count({
      where: {
        asesorComercialId,
        createdAt: { gte: inicio, lte: fin },
      },
    }),
    prisma.afiliacion.count({
      where: {
        asesorComercialId,
        createdAt: { gte: inicioAnt, lte: finAnt },
      },
    }),

    // Cartera pendiente — líneas MORA_REAL/CARTERA_REAL de cotizantes del asesor
    prisma.carteraDetallado.aggregate({
      where: {
        sucursalAsignadaId: sucursalId,
        estado: { in: ['MORA_REAL', 'CARTERA_REAL'] },
        cotizante: { afiliaciones: { some: { asesorComercialId } } },
      },
      _sum: { valorCobro: true },
    }),

    // Cartera recuperada (PAGADA_CARTERA_REAL con updatedAt en el período)
    prisma.carteraDetallado.aggregate({
      where: {
        sucursalAsignadaId: sucursalId,
        estado: 'PAGADA_CARTERA_REAL',
        updatedAt: { gte: inicio, lte: fin },
        cotizante: { afiliaciones: { some: { asesorComercialId } } },
      },
      _sum: { valorCobro: true },
    }),
    prisma.carteraDetallado.aggregate({
      where: {
        sucursalAsignadaId: sucursalId,
        estado: 'PAGADA_CARTERA_REAL',
        updatedAt: { gte: inicioAnt, lte: finAnt },
        cotizante: { afiliaciones: { some: { asesorComercialId } } },
      },
      _sum: { valorCobro: true },
    }),
  ]);

  const miCarteraPendienteValor = Number(miCarteraPendienteAgg._sum.valorCobro ?? 0);
  const recAct = Number(miCarteraRecuperadaActualAgg._sum.valorCobro ?? 0);
  const recAnt = Number(miCarteraRecuperadaAnteriorAgg._sum.valorCobro ?? 0);

  return {
    misCotizantes,
    misAfiliacionesActivas,
    misAfiliacionesNuevas: {
      actual: nuevasActual,
      anterior: nuevasAnterior,
      deltaPct: delta(nuevasActual, nuevasAnterior),
    },
    miCarteraPendienteValor,
    miCarteraRecuperadaValor: {
      actual: recAct,
      anterior: recAnt,
      deltaPct: delta(recAct, recAnt),
    },
  };
}
