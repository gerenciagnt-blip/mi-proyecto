import type { Prisma, PrismaClient } from '@pila/db';

// ===== Tipos del motor =====

export type TipoLiq = 'VINCULACION' | 'MENSUALIDAD';

export type CalcInput = {
  /** Afiliación con empresa + plan cargados. */
  afiliacion: {
    id: string;
    modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
    nivelRiesgo: 'I' | 'II' | 'III' | 'IV' | 'V';
    salario: Prisma.Decimal;
    valorAdministracion: Prisma.Decimal;
    fechaIngreso: Date;
    empresa: {
      id: string;
      exoneraLey1607: boolean;
      /** ARL de la empresa — se muestra como subconcepto ARL en dependientes. */
      arl?: { nombre: string } | null;
    } | null;
    planSgss: {
      incluyeEps: boolean;
      incluyeAfp: boolean;
      incluyeArl: boolean;
      incluyeCcf: boolean;
    } | null;
    /** Entidades SGSS asignadas al cotizante — se usan como subconcepto
     * en el desglose (ej. "SURA EPS S.A.", "Colpensiones"). */
    eps?: { nombre: string } | null;
    afp?: { nombre: string } | null;
    /** Sólo para INDEPENDIENTE — la ARL del dependiente viene de empresa.arl. */
    arl?: { nombre: string } | null;
    ccf?: { nombre: string } | null;
    /** Servicios adicionales asignados a la afiliación. Cada uno aporta
     * un concepto SERVICIO con valor = precio. */
    serviciosAdicionales?: Array<{
      id: string;
      codigo: string;
      nombre: string;
      precio: Prisma.Decimal | number;
    }>;
  };
  /**
   * Si se pasa, fuerza el tipo de liquidación ignorando la lógica
   * automática por fecha de ingreso. Útil cuando el admin emite una
   * VINCULACION manual (p.ej. cotizante afiliado hace meses al que no
   * se le había cobrado vinculación).
   */
  forzarTipo?: TipoLiq;
  /**
   * Override del valor administración SOLO para esta transacción.
   * Si se pasa, reemplaza el `afiliacion.valorAdministracion` en el
   * concepto ADMIN. No persiste cambios en la afiliación.
   */
  valorAdminOverride?: number;
  /**
   * Override de días cotizados. Útil para retiros parciales (ej. cotizante
   * que se retira el 15 → 15 días). Afecta la base prorrateada para el
   * cálculo de SGSS. No cambia el cálculo de ADMIN (que es fijo).
   */
  diasCotizadosOverride?: number;
  /**
   * Reglas internas por plan SGSS:
   *   - Si el plan NO incluye ARL y este flag es true (primera mensualidad
   *     o novedad de retiro), se cobra internamente 1 día de ARL nivel I.
   *   - El CCF interno ($100) se aplica siempre que el plan no incluya CCF
   *     (no depende de este flag).
   */
  aplicaArlObligatoria?: boolean;
  /** Año/mes del período contable (en el que se emite la factura). */
  periodo: { anio: number; mes: number };
  /**
   * Año/mes del período de APORTE SGSS (el mes que cubre la cotización).
   * Puede diferir del `periodo` contable — p. ej. un independiente VENCIDO
   * factura en abril pero cotiza por marzo. Si no se pasa, se asume
   * mismo mes que `periodo`.
   *
   * Se usa para:
   *   - Decidir días proporcionales cuando la fecha de ingreso cae en
   *     este mes (primera mensualidad de afiliación mid-mes).
   */
  periodoAporte?: { anio: number; mes: number };
  /** Base de cotización del período (si no se pasa, se usa salario). */
  ibc?: Prisma.Decimal | number;
  /** SMLV vigente al momento del cálculo (para ubicar FSP). */
  smlv: Prisma.Decimal | number;
};

export type CalcConcepto = {
  concepto:
    | 'EPS'
    | 'AFP'
    | 'ARL'
    | 'CCF'
    | 'SENA'
    | 'ICBF'
    | 'FSP'
    | 'ADMIN'
    | 'SERVICIO';
  subconcepto?: string;
  base: number;
  porcentaje: number;
  valor: number;
  aCargoEmpleador: boolean;
  observaciones?: string;
};

export type CalcResult = {
  tipo: TipoLiq;
  ibc: number; // base declarada (mes completo)
  baseCotizacion: number; // base efectiva prorrateada por días
  diasCotizados: number;
  diaDesde: number | null;
  diaHasta: number | null;
  // Totales desglosados según modelo de negocio
  totalSgss: number; // EPS + AFP + FSP + ARL + CCF + SENA + ICBF
  totalAdmon: number; // concepto ADMIN
  totalServicios: number; // conceptos SERVICIO
  totalGeneral: number; // SGSS + Admon + Servicios
  // Legado — se mantienen pero NO se muestran en UI (campo 'A cargo' retirado)
  totalEmpleador: number;
  totalTrabajador: number;
  conceptos: CalcConcepto[];
  advertencias: string[];
};

/**
 * Decide si la afiliación corresponde al período indicado y, si aplica,
 * con qué tipo/días. Devuelve `null` cuando la afiliación aún no arranca
 * en el período (fecha de ingreso posterior al último día PILA).
 *
 * Regla PILA: mes estándar de 30 días. Si ingresa el DD del mismo
 * año/mes → `VINCULACION`, días = 31 - DD, del DD al 30.
 * Si ingresa antes → `MENSUALIDAD`, 30 días completos.
 */
function determinarTipoYDias(
  fechaIngreso: Date,
  periodo: { anio: number; mes: number },
): { tipo: TipoLiq; dias: number; diaDesde: number | null; diaHasta: number | null } | null {
  const yIngreso = fechaIngreso.getUTCFullYear();
  const mIngreso = fechaIngreso.getUTCMonth() + 1;
  const dIngreso = Math.min(fechaIngreso.getUTCDate(), 30); // PILA recorta al 30

  if (yIngreso > periodo.anio || (yIngreso === periodo.anio && mIngreso > periodo.mes)) {
    // Aún no comienza
    return null;
  }
  if (yIngreso === periodo.anio && mIngreso === periodo.mes) {
    const dias = 31 - dIngreso; // DD..30 inclusive
    return { tipo: 'VINCULACION', dias, diaDesde: dIngreso, diaHasta: 30 };
  }
  // Ingresó en mes anterior → mensualidad completa
  return { tipo: 'MENSUALIDAD', dias: 30, diaDesde: null, diaHasta: null };
}

// ===== Helpers =====

/**
 * Redondeo PILA-style: ceil hacia el múltiplo de 100 más cercano.
 * Ejemplo: 228.003 → 228.100. Se aplica a cada concepto y totales.
 */
const round100Up = (n: number) => Math.ceil(n / 100) * 100;

const toNum = (v: Prisma.Decimal | number | null | undefined): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return Number(v);
};

// ===== Búsqueda de tarifas =====

type TarifaRow = {
  concepto: string;
  modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE' | null;
  nivelRiesgo: 'I' | 'II' | 'III' | 'IV' | 'V' | null;
  exonera: boolean | null;
  porcentaje: Prisma.Decimal;
  etiqueta: string | null;
};

type FspRow = {
  smlvDesde: Prisma.Decimal;
  smlvHasta: Prisma.Decimal | null;
  porcentaje: Prisma.Decimal;
};

/**
 * De un pool de tarifas activas, encuentra la que mejor matchea la
 * combinación solicitada. Si hay empate, prefiere la más específica
 * (con más discriminadores no-null).
 */
function pickTarifa(
  tarifas: TarifaRow[],
  filtro: {
    concepto: string;
    modalidad?: 'DEPENDIENTE' | 'INDEPENDIENTE';
    nivelRiesgo?: 'I' | 'II' | 'III' | 'IV' | 'V';
    exonera?: boolean;
  },
): TarifaRow | null {
  const candidatos = tarifas.filter((t) => {
    if (t.concepto !== filtro.concepto) return false;
    if (t.modalidad != null && t.modalidad !== filtro.modalidad) return false;
    if (t.nivelRiesgo != null && t.nivelRiesgo !== filtro.nivelRiesgo) return false;
    if (t.exonera != null && t.exonera !== filtro.exonera) return false;
    return true;
  });
  if (candidatos.length === 0) return null;
  // Prefiere el de mayor especificidad (más filtros no-null).
  candidatos.sort((a, b) => specificity(b) - specificity(a));
  return candidatos[0] ?? null;
}

function specificity(t: TarifaRow): number {
  return (
    (t.modalidad != null ? 1 : 0) +
    (t.nivelRiesgo != null ? 1 : 0) +
    (t.exonera != null ? 1 : 0)
  );
}

/**
 * Busca el porcentaje FSP correspondiente al IBC del cotizante.
 * Retorna 0 si el IBC está por debajo del umbral inferior (4 SMLV).
 */
function fspPorcentaje(fspRows: FspRow[], ibc: number, smlv: number): number {
  if (smlv <= 0) return 0;
  const smlvIbc = ibc / smlv;
  for (const r of fspRows) {
    const desde = toNum(r.smlvDesde);
    const hasta = r.smlvHasta == null ? Infinity : toNum(r.smlvHasta);
    if (smlvIbc >= desde && smlvIbc < hasta) {
      return toNum(r.porcentaje);
    }
  }
  return 0;
}

// ===== Motor principal =====

export function calcularLiquidacion(
  input: CalcInput,
  tarifas: TarifaRow[],
  fspRangos: FspRow[],
): CalcResult | null {
  const { afiliacion, periodo, forzarTipo } = input;

  // Período de referencia para decidir días proporcionales: el periodo de
  // APORTE (si se pasó) o el contable como fallback. Esto arregla el caso
  // de la primera mensualidad cuando la fecha de ingreso cae en el mes
  // de aporte pero la factura se emite en otro mes contable (p. ej. mes
  // vencido, o simplemente factura mes siguiente al de afiliación).
  const periodoReferencia = input.periodoAporte ?? periodo;

  // Tipo y días según fecha de ingreso vs período de aporte.
  // Si el llamador fuerza un tipo (emisión manual), ajustamos los días:
  //   - VINCULACION forzada → usa días proporcionales si los hay
  //   - MENSUALIDAD forzada → usa días proporcionales si fechaIngreso cae
  //     en el período de aporte; 30 completos si ya ingresó antes.
  // Si no se fuerza, seguimos la lógica automática.
  let tipo: TipoLiq;
  let diasCotizados: number;
  let diaDesde: number | null;
  let diaHasta: number | null;

  if (forzarTipo) {
    const auto = determinarTipoYDias(afiliacion.fechaIngreso, periodoReferencia);
    tipo = forzarTipo;
    // Si auto existe (fechaIngreso dentro o antes del período), usamos
    // sus días — esto da proporcional correcto cuando forzamos MENSUALIDAD
    // y la fecha cae en el período de aporte.
    if (auto) {
      diasCotizados = auto.dias;
      diaDesde = auto.diaDesde;
      diaHasta = auto.diaHasta;
    } else {
      diasCotizados = 30;
      diaDesde = null;
      diaHasta = null;
    }
  } else {
    const td = determinarTipoYDias(afiliacion.fechaIngreso, periodoReferencia);
    if (!td) return null;
    tipo = td.tipo;
    diasCotizados = td.dias;
    diaDesde = td.diaDesde;
    diaHasta = td.diaHasta;
  }

  // Override explícito de días (p.ej. retiro a mitad de mes).
  if (input.diasCotizadosOverride != null && input.diasCotizadosOverride > 0) {
    diasCotizados = Math.min(30, Math.max(1, Math.floor(input.diasCotizadosOverride)));
    // Cuando el admin fija los días, diaDesde/diaHasta pierden sentido automático.
    diaDesde = null;
    diaHasta = null;
  }

  const ibc = toNum(input.ibc ?? afiliacion.salario);
  // Base prorrateada: IBC * días / 30 (mes PILA). Cuando días=30, base=ibc.
  // La base NO se redondea (es el IBC real prorrateado). El redondeo se
  // aplica al valor de cada concepto más abajo.
  const baseCotizacion = Math.round((ibc * diasCotizados) / 30);

  const smlv = toNum(input.smlv);
  const plan = afiliacion.planSgss;
  const empresa = afiliacion.empresa;
  const modalidad = afiliacion.modalidad;
  const nivel = afiliacion.nivelRiesgo;
  const exonera = empresa?.exoneraLey1607 === true;

  const advertencias: string[] = [];
  const conceptos: CalcConcepto[] = [];

  const addConcepto = (c: Omit<CalcConcepto, 'valor'>) => {
    const valor = round100Up((c.base * c.porcentaje) / 100);
    conceptos.push({ ...c, valor });
  };

  // ---- VINCULACION: cobro administrativo, NO se liquida SGSS ----
  // La primera transacción del cotizante sólo causa el "Valor
  // administración" definido en su afiliación (cobro operativo del
  // aliado). Los conceptos SGSS empiezan a correr en la MENSUALIDAD.
  if (tipo === 'VINCULACION') {
    const valorAdmin =
      input.valorAdminOverride != null
        ? input.valorAdminOverride
        : toNum(afiliacion.valorAdministracion);
    const valorRedondeado = round100Up(valorAdmin);
    const vinc: CalcConcepto = {
      concepto: 'ADMIN',
      subconcepto: 'Valor administración (vinculación)',
      base: valorAdmin,
      porcentaje: 100,
      valor: valorRedondeado,
      aCargoEmpleador: modalidad === 'DEPENDIENTE',
      observaciones: 'Cobro administrativo por afiliación — no incluye SGSS',
    };
    const conceptosVinc: CalcConcepto[] = [vinc];

    // Servicios adicionales también se cobran en la vinculación
    const serviciosVinc = afiliacion.serviciosAdicionales ?? [];
    for (const s of serviciosVinc) {
      const precio = toNum(s.precio);
      if (precio <= 0) continue;
      conceptosVinc.push({
        concepto: 'SERVICIO',
        subconcepto: `${s.codigo} — ${s.nombre}`,
        base: precio,
        porcentaje: 100,
        valor: round100Up(precio),
        aCargoEmpleador: false,
      });
    }

    const totalAdmonV = valorRedondeado;
    const totalServiciosV = conceptosVinc
      .filter((c) => c.concepto === 'SERVICIO')
      .reduce((s, c) => s + c.valor, 0);
    const totalGeneralV = totalAdmonV + totalServiciosV;

    return {
      tipo,
      ibc,
      baseCotizacion,
      diasCotizados,
      diaDesde,
      diaHasta,
      totalSgss: 0,
      totalAdmon: totalAdmonV,
      totalServicios: totalServiciosV,
      totalGeneral: totalGeneralV,
      totalEmpleador: vinc.aCargoEmpleador ? valorRedondeado : 0,
      totalTrabajador: vinc.aCargoEmpleador ? 0 : valorRedondeado,
      conceptos: conceptosVinc,
      advertencias: [],
    };
  }

  // ---- MENSUALIDAD: liquidación SGSS normal ----

  // ---- EPS ----
  // Sin plan ⇒ por defecto se aplica EPS completa (protección por omisión).
  const aplicaEps = !plan || plan.incluyeEps;
  if (aplicaEps) {
    const t = pickTarifa(tarifas, {
      concepto: 'EPS',
      modalidad,
      exonera: modalidad === 'DEPENDIENTE' ? exonera : undefined,
    });
    if (t) {
      addConcepto({
        concepto: 'EPS',
        // Subconcepto = nombre de la EPS asignada al cotizante (si existe),
        // fallback a la etiqueta de la tarifa.
        subconcepto: afiliacion.eps?.nombre ?? t.etiqueta ?? undefined,
        base: baseCotizacion,
        porcentaje: toNum(t.porcentaje),
        aCargoEmpleador: modalidad === 'DEPENDIENTE' && !exonera, // dep no exonerado: 8.5%emp + 4%trab — simplificamos al total
      });
    } else {
      advertencias.push(`Sin tarifa EPS para ${modalidad}${exonera ? ' (exonerado)' : ''}`);
    }
  }

  // ---- AFP (pensión) + FSP ----
  const aplicaAfp = !plan || plan.incluyeAfp;
  if (aplicaAfp) {
    const t = pickTarifa(tarifas, { concepto: 'AFP', modalidad });
    if (t) {
      addConcepto({
        concepto: 'AFP',
        subconcepto: afiliacion.afp?.nombre ?? t.etiqueta ?? undefined,
        base: baseCotizacion,
        porcentaje: toNum(t.porcentaje),
        aCargoEmpleador: modalidad === 'DEPENDIENTE',
      });
    } else {
      advertencias.push(`Sin tarifa AFP para ${modalidad}`);
    }

    const fspPct = fspPorcentaje(fspRangos, ibc, smlv);
    if (fspPct > 0) {
      addConcepto({
        concepto: 'FSP',
        subconcepto: `FSP ${(ibc / smlv).toFixed(2)} SMLV`,
        base: baseCotizacion,
        porcentaje: fspPct,
        aCargoEmpleador: false,
        observaciones: 'Adiciona al aporte de pensión',
      });
    }
  }

  // ---- ARL ----
  // DEPENDIENTE → se toma de empresa.arl. INDEPENDIENTE → de afiliacion.arl.
  const aplicaArl = !plan || plan.incluyeArl;
  if (aplicaArl) {
    const t = pickTarifa(tarifas, { concepto: 'ARL', nivelRiesgo: nivel });
    if (t) {
      const arlNombre =
        modalidad === 'DEPENDIENTE'
          ? afiliacion.empresa?.arl?.nombre
          : afiliacion.arl?.nombre;
      addConcepto({
        concepto: 'ARL',
        subconcepto: arlNombre ?? t.etiqueta ?? `Nivel ${nivel}`,
        base: baseCotizacion,
        porcentaje: toNum(t.porcentaje),
        aCargoEmpleador: modalidad === 'DEPENDIENTE',
      });
    } else {
      advertencias.push(`Sin tarifa ARL para nivel ${nivel}`);
    }
  } else if (input.aplicaArlObligatoria) {
    // Regla interna: si el plan NO incluye ARL pero es primera mensualidad
    // o hay novedad de retiro, se cobra 1 día de ARL nivel I.
    const tNivelI = pickTarifa(tarifas, { concepto: 'ARL', nivelRiesgo: 'I' });
    if (tNivelI) {
      const baseUnDia = Math.round(ibc / 30);
      addConcepto({
        concepto: 'ARL',
        subconcepto: 'ARL Nivel I (interno · 1 día)',
        base: baseUnDia,
        porcentaje: toNum(tNivelI.porcentaje),
        aCargoEmpleador: modalidad === 'DEPENDIENTE',
        observaciones: 'Plan sin ARL — cobro interno obligatorio',
      });
    }
  }

  // ---- CCF ----
  const aplicaCcf = !plan || plan.incluyeCcf;
  if (aplicaCcf) {
    const t = pickTarifa(tarifas, { concepto: 'CCF', modalidad });
    if (t) {
      addConcepto({
        concepto: 'CCF',
        subconcepto: afiliacion.ccf?.nombre ?? t.etiqueta ?? undefined,
        base: baseCotizacion,
        porcentaje: toNum(t.porcentaje),
        aCargoEmpleador: modalidad === 'DEPENDIENTE',
      });
    } else {
      advertencias.push(`Sin tarifa CCF para ${modalidad}`);
    }
  } else {
    // Regla interna: el plan NO incluye CCF → se cobra valor fijo de $100
    // que se suma al total. No depende de IBC ni porcentaje.
    conceptos.push({
      concepto: 'CCF',
      subconcepto: 'CCF interno',
      base: 100,
      porcentaje: 100,
      valor: 100,
      aCargoEmpleador: modalidad === 'DEPENDIENTE',
      observaciones: 'Plan sin CCF — cobro interno fijo $100',
    });
  }

  // ---- SENA / ICBF (solo dependiente no exonerado) ----
  if (modalidad === 'DEPENDIENTE' && !exonera) {
    for (const concepto of ['SENA', 'ICBF'] as const) {
      const t = pickTarifa(tarifas, {
        concepto,
        modalidad,
        exonera: false,
      });
      if (t) {
        addConcepto({
          concepto,
          subconcepto: t.etiqueta ?? undefined,
          base: baseCotizacion,
          porcentaje: toNum(t.porcentaje),
          aCargoEmpleador: true,
        });
      }
    }
  }

  // ---- ADMIN (cobro operativo mensual del aliado) ----
  // En MENSUALIDAD el valor administración también se cobra mes a mes.
  // El override aplica aquí si viene.
  const valorAdmin =
    input.valorAdminOverride != null
      ? input.valorAdminOverride
      : toNum(afiliacion.valorAdministracion);
  if (valorAdmin > 0) {
    const valorRedondeado = round100Up(valorAdmin);
    conceptos.push({
      concepto: 'ADMIN',
      subconcepto: 'Valor administración (mensual)',
      base: valorAdmin,
      porcentaje: 100,
      valor: valorRedondeado,
      aCargoEmpleador: modalidad === 'DEPENDIENTE',
    });
  }

  // ---- SERVICIOS ADICIONALES ----
  const servicios = afiliacion.serviciosAdicionales ?? [];
  for (const s of servicios) {
    const precio = toNum(s.precio);
    if (precio <= 0) continue;
    const valorRedondeado = round100Up(precio);
    conceptos.push({
      concepto: 'SERVICIO',
      subconcepto: `${s.codigo} — ${s.nombre}`,
      base: precio,
      porcentaje: 100,
      valor: valorRedondeado,
      aCargoEmpleador: false,
    });
  }

  // ---- Totales ----
  // Cada concepto ya viene redondeado al múltiplo de 100 hacia arriba,
  // así que los totales son suma directa (y también múltiplos de 100).
  const SGSS = new Set(['EPS', 'AFP', 'FSP', 'ARL', 'CCF', 'SENA', 'ICBF']);
  const totalSgss = conceptos
    .filter((c) => SGSS.has(c.concepto))
    .reduce((s, c) => s + c.valor, 0);
  const totalAdmon = conceptos
    .filter((c) => c.concepto === 'ADMIN')
    .reduce((s, c) => s + c.valor, 0);
  const totalServicios = conceptos
    .filter((c) => c.concepto === 'SERVICIO')
    .reduce((s, c) => s + c.valor, 0);
  const totalGeneral = totalSgss + totalAdmon + totalServicios;

  // Legado — se mantienen por compatibilidad de schema
  const totalEmpleador = conceptos
    .filter((c) => c.aCargoEmpleador)
    .reduce((s, c) => s + c.valor, 0);
  const totalTrabajador = conceptos
    .filter((c) => !c.aCargoEmpleador)
    .reduce((s, c) => s + c.valor, 0);

  return {
    tipo,
    ibc,
    baseCotizacion,
    diasCotizados,
    diaDesde,
    diaHasta,
    totalSgss,
    totalAdmon,
    totalServicios,
    totalGeneral,
    totalEmpleador,
    totalTrabajador,
    conceptos,
    advertencias,
  };
}

// ===== Helper de BD: corre el motor + persiste =====

/**
 * Recalcula y persiste una liquidación individual en una transacción.
 * Retorna `null` cuando la afiliación aún no debe liquidarse en el
 * período (fecha de ingreso posterior al último día).
 */
export async function persistirLiquidacion(
  prisma: PrismaClient,
  opts: {
    periodoId: string;
    afiliacionId: string;
    ibc?: number;
    forzarTipo?: TipoLiq;
    valorAdminOverride?: number;
    diasCotizadosOverride?: number;
    aplicaArlObligatoria?: boolean;
    /** Período de aporte SGSS cuando difiere del período contable.
     * Null/undefined = mismo período. Si se pasa, se persiste en la
     * liquidación para el plano PILA. */
    periodoAporteAnio?: number;
    periodoAporteMes?: number;
  },
): Promise<{ liquidacionId: string; calc: CalcResult } | null> {
  const [periodo, afiliacion, tarifas, fspRangos] = await Promise.all([
    prisma.periodoContable.findUnique({ where: { id: opts.periodoId } }),
    prisma.afiliacion.findUnique({
      where: { id: opts.afiliacionId },
      include: {
        empresa: {
          select: {
            id: true,
            exoneraLey1607: true,
            arl: { select: { nombre: true } },
          },
        },
        planSgss: {
          select: {
            incluyeEps: true,
            incluyeAfp: true,
            incluyeArl: true,
            incluyeCcf: true,
          },
        },
        eps: { select: { nombre: true } },
        afp: { select: { nombre: true } },
        arl: { select: { nombre: true } },
        ccf: { select: { nombre: true } },
        serviciosAdicionales: {
          include: {
            servicio: {
              select: { id: true, codigo: true, nombre: true, precio: true },
            },
          },
        },
      },
    }),
    prisma.tarifaSgss.findMany({ where: { active: true } }),
    prisma.fspRango.findMany({ where: { active: true }, orderBy: { smlvDesde: 'asc' } }),
  ]);

  if (!periodo) throw new Error('Período no existe');
  if (!afiliacion) throw new Error('Afiliación no existe');

  const calc = calcularLiquidacion(
    {
      afiliacion: {
        id: afiliacion.id,
        modalidad: afiliacion.modalidad,
        nivelRiesgo: afiliacion.nivelRiesgo,
        salario: afiliacion.salario,
        valorAdministracion: afiliacion.valorAdministracion,
        fechaIngreso: afiliacion.fechaIngreso,
        empresa: afiliacion.empresa,
        planSgss: afiliacion.planSgss,
        eps: afiliacion.eps,
        afp: afiliacion.afp,
        arl: afiliacion.arl,
        ccf: afiliacion.ccf,
        serviciosAdicionales: afiliacion.serviciosAdicionales.map((s) => ({
          id: s.servicio.id,
          codigo: s.servicio.codigo,
          nombre: s.servicio.nombre,
          precio: s.servicio.precio,
        })),
      },
      periodo: { anio: periodo.anio, mes: periodo.mes },
      periodoAporte:
        opts.periodoAporteAnio && opts.periodoAporteMes
          ? { anio: opts.periodoAporteAnio, mes: opts.periodoAporteMes }
          : undefined,
      ibc: opts.ibc,
      smlv: periodo.smlvSnapshot,
      forzarTipo: opts.forzarTipo,
      valorAdminOverride: opts.valorAdminOverride,
      diasCotizadosOverride: opts.diasCotizadosOverride,
      aplicaArlObligatoria: opts.aplicaArlObligatoria,
    },
    tarifas,
    fspRangos,
  );

  if (!calc) return null; // afiliación no aplica para este período

  const liquidacionId = await prisma.$transaction(async (tx) => {
    const existing = await tx.liquidacion.findUnique({
      where: {
        periodoId_afiliacionId_tipo: {
          periodoId: opts.periodoId,
          afiliacionId: opts.afiliacionId,
          tipo: calc.tipo,
        },
      },
      select: { id: true, estado: true },
    });

    if (existing && existing.estado === 'PAGADA') {
      return existing.id;
    }

    const liq = existing
      ? await tx.liquidacion.update({
          where: { id: existing.id },
          data: {
            ibc: calc.ibc,
            diasCotizados: calc.diasCotizados,
            diaDesde: calc.diaDesde,
            diaHasta: calc.diaHasta,
            totalEmpleador: calc.totalEmpleador,
            totalTrabajador: calc.totalTrabajador,
            totalGeneral: calc.totalGeneral,
            periodoAporteAnio: opts.periodoAporteAnio ?? null,
            periodoAporteMes: opts.periodoAporteMes ?? null,
            estado: 'BORRADOR',
            calculadoEn: new Date(),
          },
        })
      : await tx.liquidacion.create({
          data: {
            periodoId: opts.periodoId,
            afiliacionId: opts.afiliacionId,
            tipo: calc.tipo,
            ibc: calc.ibc,
            diasCotizados: calc.diasCotizados,
            diaDesde: calc.diaDesde,
            diaHasta: calc.diaHasta,
            totalEmpleador: calc.totalEmpleador,
            totalTrabajador: calc.totalTrabajador,
            totalGeneral: calc.totalGeneral,
            periodoAporteAnio: opts.periodoAporteAnio ?? null,
            periodoAporteMes: opts.periodoAporteMes ?? null,
          },
        });

    await tx.liquidacionConcepto.deleteMany({ where: { liquidacionId: liq.id } });
    if (calc.conceptos.length > 0) {
      await tx.liquidacionConcepto.createMany({
        data: calc.conceptos.map((c) => ({
          liquidacionId: liq.id,
          concepto: c.concepto,
          subconcepto: c.subconcepto,
          base: c.base,
          porcentaje: c.porcentaje,
          valor: c.valor,
          aCargoEmpleador: c.aCargoEmpleador,
          observaciones: c.observaciones,
        })),
      });
    }
    return liq.id;
  });

  return { liquidacionId, calc };
}
