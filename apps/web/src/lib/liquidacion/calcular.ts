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
    fechaIngreso: Date;
    empresa: { id: string; exoneraLey1607: boolean } | null;
    planSgss: {
      incluyeEps: boolean;
      incluyeAfp: boolean;
      incluyeArl: boolean;
      incluyeCcf: boolean;
    } | null;
  };
  /** Año/mes del período a liquidar. */
  periodo: { anio: number; mes: number };
  /** Base de cotización del período (si no se pasa, se usa salario). */
  ibc?: Prisma.Decimal | number;
  /** SMLV vigente al momento del cálculo (para ubicar FSP). */
  smlv: Prisma.Decimal | number;
};

export type CalcConcepto = {
  concepto: 'EPS' | 'AFP' | 'ARL' | 'CCF' | 'SENA' | 'ICBF' | 'FSP';
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
  totalEmpleador: number;
  totalTrabajador: number;
  totalGeneral: number;
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

const round = (n: number) => Math.round(n);

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
  const { afiliacion, periodo } = input;

  // Tipo y días según fecha de ingreso vs período
  const td = determinarTipoYDias(afiliacion.fechaIngreso, periodo);
  if (!td) return null;
  const tipo = td.tipo;
  const diasCotizados = td.dias;

  const ibc = toNum(input.ibc ?? afiliacion.salario);
  // Base prorrateada: IBC * días / 30 (mes PILA). Cuando días=30, base=ibc.
  const baseCotizacion = round((ibc * diasCotizados) / 30);

  const smlv = toNum(input.smlv);
  const plan = afiliacion.planSgss;
  const empresa = afiliacion.empresa;
  const modalidad = afiliacion.modalidad;
  const nivel = afiliacion.nivelRiesgo;
  const exonera = empresa?.exoneraLey1607 === true;

  const advertencias: string[] = [];
  const conceptos: CalcConcepto[] = [];

  const addConcepto = (c: Omit<CalcConcepto, 'valor'>) => {
    const valor = round((c.base * c.porcentaje) / 100);
    conceptos.push({ ...c, valor });
  };

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
        subconcepto: t.etiqueta ?? undefined,
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
        subconcepto: t.etiqueta ?? undefined,
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
  const aplicaArl = !plan || plan.incluyeArl;
  if (aplicaArl) {
    const t = pickTarifa(tarifas, { concepto: 'ARL', nivelRiesgo: nivel });
    if (t) {
      addConcepto({
        concepto: 'ARL',
        subconcepto: t.etiqueta ?? `Nivel ${nivel}`,
        base: baseCotizacion,
        porcentaje: toNum(t.porcentaje),
        aCargoEmpleador: modalidad === 'DEPENDIENTE',
      });
    } else {
      advertencias.push(`Sin tarifa ARL para nivel ${nivel}`);
    }
  }

  // ---- CCF ----
  const aplicaCcf = !plan || plan.incluyeCcf;
  if (aplicaCcf) {
    const t = pickTarifa(tarifas, { concepto: 'CCF', modalidad });
    if (t) {
      addConcepto({
        concepto: 'CCF',
        subconcepto: t.etiqueta ?? undefined,
        base: baseCotizacion,
        porcentaje: toNum(t.porcentaje),
        aCargoEmpleador: modalidad === 'DEPENDIENTE',
      });
    } else {
      advertencias.push(`Sin tarifa CCF para ${modalidad}`);
    }
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

  // ---- Totales ----
  const totalEmpleador = conceptos
    .filter((c) => c.aCargoEmpleador)
    .reduce((s, c) => s + c.valor, 0);
  const totalTrabajador = conceptos
    .filter((c) => !c.aCargoEmpleador)
    .reduce((s, c) => s + c.valor, 0);
  const totalGeneral = totalEmpleador + totalTrabajador;

  return {
    tipo,
    ibc,
    baseCotizacion,
    diasCotizados,
    diaDesde: td.diaDesde,
    diaHasta: td.diaHasta,
    totalEmpleador,
    totalTrabajador,
    totalGeneral,
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
  },
): Promise<{ liquidacionId: string; calc: CalcResult } | null> {
  const [periodo, afiliacion, tarifas, fspRangos] = await Promise.all([
    prisma.periodoContable.findUnique({ where: { id: opts.periodoId } }),
    prisma.afiliacion.findUnique({
      where: { id: opts.afiliacionId },
      include: {
        empresa: { select: { id: true, exoneraLey1607: true } },
        planSgss: {
          select: {
            incluyeEps: true,
            incluyeAfp: true,
            incluyeArl: true,
            incluyeCcf: true,
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
        fechaIngreso: afiliacion.fechaIngreso,
        empresa: afiliacion.empresa,
        planSgss: afiliacion.planSgss,
      },
      periodo: { anio: periodo.anio, mes: periodo.mes },
      ibc: opts.ibc,
      smlv: periodo.smlvSnapshot,
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
