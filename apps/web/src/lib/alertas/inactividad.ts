import { prisma } from '@pila/db';

/**
 * Detección de "inactividad" en flujos críticos.
 *
 * Dos señales que importan al negocio:
 *
 *   1. Líneas de cartera activa (MORA_REAL / CARTERA_REAL) sin gestión
 *      en 30+ días. Indica que nadie las está cobrando — riesgo de
 *      castigo definitivo.
 *
 *   2. Empresas planilla activas que no han pagado planilla en 60+ días.
 *      Puede indicar empresa congelada, o cotizantes que migraron sin
 *      avisar. Conviene revisar.
 *
 * Diseño:
 *   - Una sola función `cargarAlertasInactividad()` que consulta ambas
 *     señales en paralelo.
 *   - Devuelve sólo las top-N de cada categoría (saturar la UI con 200
 *     entradas no ayuda; el aliado quiere ver "lo más urgente").
 */

export type AlertaCarteraInactiva = {
  /** Id de CarteraDetallado. */
  id: string;
  /** Cotizante: documento + nombre, para mostrar sin más joins. */
  numeroDocumento: string;
  nombreCompleto: string;
  /** Período de cobro (ej. "2025-09"). */
  periodoCobro: string;
  /** Valor pendiente de la línea (en pesos, ya parseado). */
  valor: number;
  /** Estado actual (MORA_REAL o CARTERA_REAL). */
  estado: 'MORA_REAL' | 'CARTERA_REAL';
  /** Última gestión registrada. null si nunca se gestionó. */
  ultimaGestion: Date | null;
  /** Días sin gestión (desde la última o desde createdAt). */
  diasSinGestion: number;
  /** Sucursal asignada (si la hay). */
  sucursalCodigo: string | null;
  sucursalNombre: string | null;
};

export type AlertaEmpresaSinPlanilla = {
  /** Id de Empresa. */
  id: string;
  nit: string;
  nombre: string;
  /** Última planilla pagada. null si nunca. */
  ultimaPlanillaPagadaEn: Date | null;
  /** Días desde la última planilla pagada (o desde createdAt si nunca). */
  diasSinPlanilla: number;
  /** Cotizantes activos en la empresa (vía afiliaciones). */
  afiliacionesActivas: number;
};

export type AlertasInactividad = {
  cartera: AlertaCarteraInactiva[];
  empresasSinPlanilla: AlertaEmpresaSinPlanilla[];
  /** Total real (sin tope) — para mostrar "12 de 47" si es necesario. */
  totales: {
    cartera: number;
    empresasSinPlanilla: number;
  };
};

export type CargarAlertasOpts = {
  /** Si null/undefined → consolidado. Si es un id → scope a esa sucursal. */
  sucursalId: string | null;
  /** Umbral de días sin gestión para cartera (default 30). */
  umbralCarteraDias?: number;
  /** Umbral de días sin planilla pagada para empresa (default 60). */
  umbralEmpresaDias?: number;
  /** Cuántas filas devolver por categoría (default 10). */
  top?: number;
};

const MS_DIA = 1000 * 60 * 60 * 24;

/** Cuenta de días enteros entre dos fechas (no negativo). */
function diasEntre(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / MS_DIA));
}

export async function cargarAlertasInactividad(
  opts: CargarAlertasOpts,
): Promise<AlertasInactividad> {
  const { sucursalId } = opts;
  const umbralCarteraDias = opts.umbralCarteraDias ?? 30;
  const umbralEmpresaDias = opts.umbralEmpresaDias ?? 60;
  const top = opts.top ?? 10;

  const ahora = new Date();
  const fechaLimiteCartera = new Date(ahora.getTime() - umbralCarteraDias * MS_DIA);
  const fechaLimiteEmpresa = new Date(ahora.getTime() - umbralEmpresaDias * MS_DIA);

  // ---------- Cartera inactiva ----------
  // Líneas con estado activo y o bien no tienen gestiones, o la última
  // gestión es más vieja que el umbral. Filtramos a posteriori en JS
  // porque Prisma no soporta directamente "max(gestion.createdAt) < X".
  // El tope de 500 es defensivo: en operación normal hay menos.
  const carteraCandidatas = await prisma.carteraDetallado.findMany({
    where: {
      estado: { in: ['MORA_REAL', 'CARTERA_REAL'] },
      ...(sucursalId ? { sucursalAsignadaId: sucursalId } : {}),
    },
    take: 500,
    orderBy: { createdAt: 'asc' }, // las más antiguas primero
    select: {
      id: true,
      numeroDocumento: true,
      nombreCompleto: true,
      periodoCobro: true,
      valorCobro: true,
      estado: true,
      createdAt: true,
      sucursalAsignada: { select: { codigo: true, nombre: true } },
      gestiones: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const carteraInactivasTodas: AlertaCarteraInactiva[] = carteraCandidatas
    .map((c) => {
      const ultimaGestion = c.gestiones[0]?.createdAt ?? null;
      const referencia = ultimaGestion ?? c.createdAt;
      const dias = diasEntre(referencia, ahora);
      return {
        id: c.id,
        numeroDocumento: c.numeroDocumento,
        nombreCompleto: c.nombreCompleto,
        periodoCobro: c.periodoCobro,
        valor: Number(c.valorCobro),
        estado: c.estado as 'MORA_REAL' | 'CARTERA_REAL',
        ultimaGestion,
        diasSinGestion: dias,
        sucursalCodigo: c.sucursalAsignada?.codigo ?? null,
        sucursalNombre: c.sucursalAsignada?.nombre ?? null,
      };
    })
    .filter((c) => c.diasSinGestion >= umbralCarteraDias)
    // Más días sin gestión primero; entre iguales, mayor valor primero.
    .sort((a, b) => b.diasSinGestion - a.diasSinGestion || b.valor - a.valor);

  const carteraInactivas = carteraInactivasTodas.slice(0, top);

  // ---------- Empresas sin planilla ----------
  // Empresas activas con al menos una afiliación activa, donde la última
  // planilla PAGADA es más vieja que el umbral (o no hay ninguna).
  // Filtramos en JS por la misma razón que arriba.
  const empresasCandidatas = await prisma.empresa.findMany({
    where: {
      active: true,
      // Hay al menos una afiliación activa de la sucursal del scope (si
      // estamos en SUCURSAL). Si es STAFF, traemos todas las empresas
      // que tengan al menos una afiliación activa.
      afiliaciones: {
        some: {
          estado: 'ACTIVA',
          ...(sucursalId ? { cotizante: { sucursalId } } : {}),
        },
      },
    },
    select: {
      id: true,
      nit: true,
      nombre: true,
      createdAt: true,
      planillas: {
        where: {
          estado: 'PAGADA',
          pagadoEn: { not: null },
          ...(sucursalId ? { sucursalId } : {}),
        },
        orderBy: { pagadoEn: 'desc' },
        take: 1,
        select: { pagadoEn: true },
      },
      _count: {
        select: {
          afiliaciones: {
            where: {
              estado: 'ACTIVA',
              ...(sucursalId ? { cotizante: { sucursalId } } : {}),
            },
          },
        },
      },
    },
  });

  const empresasInactivasTodas: AlertaEmpresaSinPlanilla[] = empresasCandidatas
    .map((e) => {
      const ultima = e.planillas[0]?.pagadoEn ?? null;
      const referencia = ultima ?? e.createdAt;
      const dias = diasEntre(referencia, ahora);
      return {
        id: e.id,
        nit: e.nit,
        nombre: e.nombre,
        ultimaPlanillaPagadaEn: ultima,
        diasSinPlanilla: dias,
        afiliacionesActivas: e._count.afiliaciones,
      };
    })
    .filter((e) => e.diasSinPlanilla >= umbralEmpresaDias && e.afiliacionesActivas > 0)
    // Más días sin planilla primero; entre iguales, más afiliaciones primero.
    .sort(
      (a, b) =>
        b.diasSinPlanilla - a.diasSinPlanilla || b.afiliacionesActivas - a.afiliacionesActivas,
    );

  const empresasInactivas = empresasInactivasTodas.slice(0, top);

  return {
    cartera: carteraInactivas,
    empresasSinPlanilla: empresasInactivas,
    totales: {
      cartera: carteraInactivasTodas.length,
      empresasSinPlanilla: empresasInactivasTodas.length,
    },
  };
}
