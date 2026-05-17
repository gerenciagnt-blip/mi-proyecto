/**
 * Tests del motor de liquidación SGSS.
 *
 * `calcularLiquidacion` es una función pura: recibe input + tarifas y
 * devuelve el desglose de conceptos con totales. NO toca BD. Estos
 * tests fijan el contrato del cálculo de dinero del sistema — es la
 * pieza más crítica del negocio.
 *
 * Estructura:
 *   - Fixtures: tarifas y FSP típicos del modelo PILA Colombia.
 *   - Helpers: builders para afiliaciones DEPENDIENTE/INDEPENDIENTE.
 *   - Suites por rama de negocio: VINCULACION, MENSUALIDAD dep/indep,
 *     exoneración Ley 1607, FSP, plan parcial, ARL interna, días
 *     proporcionales, redondeo, casos límite.
 *
 * Cuando se agregue una regla nueva al motor: agregar test acá primero,
 * verlo fallar, luego cambiar `calcular.ts` hasta que pase. Esto es
 * el contrato vivo del cálculo.
 */

import { describe, it, expect } from 'vitest';
import { calcularLiquidacion, type CalcInput } from './calcular';

// =====================================================================
// Fixtures de tarifas — porcentajes oficiales Colombia (12.5% EPS, etc.)
// =====================================================================

type TarifaRow = Parameters<typeof calcularLiquidacion>[1][number];
type FspRow = Parameters<typeof calcularLiquidacion>[2][number];

const tarifasBase: TarifaRow[] = [
  // EPS dependiente no exonerado: 12.5% (8.5% emp + 4% trab)
  {
    concepto: 'EPS',
    modalidad: 'DEPENDIENTE',
    nivelRiesgo: null,
    exonera: false,
    porcentaje: 12.5 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'EPS dependiente',
  },
  // EPS dependiente exonerado: solo 4% (el 8.5% del empleador se exonera)
  {
    concepto: 'EPS',
    modalidad: 'DEPENDIENTE',
    nivelRiesgo: null,
    exonera: true,
    porcentaje: 4 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'EPS dependiente exonerado',
  },
  // EPS independiente: 12.5% completo, todo del cotizante
  {
    concepto: 'EPS',
    modalidad: 'INDEPENDIENTE',
    nivelRiesgo: null,
    exonera: null,
    porcentaje: 12.5 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'EPS independiente',
  },
  // AFP: 16% en ambas modalidades
  {
    concepto: 'AFP',
    modalidad: 'DEPENDIENTE',
    nivelRiesgo: null,
    exonera: null,
    porcentaje: 16 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'AFP dependiente',
  },
  {
    concepto: 'AFP',
    modalidad: 'INDEPENDIENTE',
    nivelRiesgo: null,
    exonera: null,
    porcentaje: 16 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'AFP independiente',
  },
  // ARL por nivel (1-5)
  {
    concepto: 'ARL',
    modalidad: null,
    nivelRiesgo: 'I',
    exonera: null,
    porcentaje: 0.522 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'ARL Nivel I',
  },
  {
    concepto: 'ARL',
    modalidad: null,
    nivelRiesgo: 'II',
    exonera: null,
    porcentaje: 1.044 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'ARL Nivel II',
  },
  {
    concepto: 'ARL',
    modalidad: null,
    nivelRiesgo: 'III',
    exonera: null,
    porcentaje: 2.436 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'ARL Nivel III',
  },
  // CCF: 4% en ambas modalidades
  {
    concepto: 'CCF',
    modalidad: 'DEPENDIENTE',
    nivelRiesgo: null,
    exonera: null,
    porcentaje: 4 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'CCF dependiente',
  },
  {
    concepto: 'CCF',
    modalidad: 'INDEPENDIENTE',
    nivelRiesgo: null,
    exonera: null,
    porcentaje: 4 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'CCF independiente',
  },
  // SENA + ICBF: solo dependiente no exonerado
  {
    concepto: 'SENA',
    modalidad: 'DEPENDIENTE',
    nivelRiesgo: null,
    exonera: false,
    porcentaje: 2 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'SENA',
  },
  {
    concepto: 'ICBF',
    modalidad: 'DEPENDIENTE',
    nivelRiesgo: null,
    exonera: false,
    porcentaje: 3 as unknown as TarifaRow['porcentaje'],
    etiqueta: 'ICBF',
  },
];

// FSP por tramo (sobre IBC en SMLV)
const fspRangos: FspRow[] = [
  {
    smlvDesde: 4 as unknown as FspRow['smlvDesde'],
    smlvHasta: 16 as unknown as FspRow['smlvHasta'],
    porcentaje: 1 as unknown as FspRow['porcentaje'],
  },
  {
    smlvDesde: 16 as unknown as FspRow['smlvDesde'],
    smlvHasta: 17 as unknown as FspRow['smlvHasta'],
    porcentaje: 1.2 as unknown as FspRow['porcentaje'],
  },
  {
    smlvDesde: 17 as unknown as FspRow['smlvDesde'],
    smlvHasta: null,
    porcentaje: 2 as unknown as FspRow['porcentaje'],
  },
];

// =====================================================================
// Helpers para construir inputs
// =====================================================================

const PERIODO_AGO_2026 = { anio: 2026, mes: 8 };
const SMLV_2026 = 1_300_000;

type AfiliacionInput = CalcInput['afiliacion'];

function afiliacionDep(overrides: Partial<AfiliacionInput> = {}): AfiliacionInput {
  return {
    id: 'af1',
    modalidad: 'DEPENDIENTE',
    nivelRiesgo: 'I',
    salario: 1_500_000 as unknown as AfiliacionInput['salario'],
    valorAdministracion: 50_000 as unknown as AfiliacionInput['valorAdministracion'],
    fechaIngreso: new Date('2026-01-15T00:00:00.000Z'),
    empresa: {
      id: 'emp1',
      exoneraLey1607: false,
      arl: { nombre: 'ARL SURA' },
    },
    planSgss: { incluyeEps: true, incluyeAfp: true, incluyeArl: true, incluyeCcf: true },
    eps: { nombre: 'EPS SURA' },
    afp: { nombre: 'Colpensiones' },
    ccf: { nombre: 'Compensar' },
    ...overrides,
  };
}

function afiliacionIndep(overrides: Partial<AfiliacionInput> = {}): AfiliacionInput {
  return {
    id: 'af2',
    modalidad: 'INDEPENDIENTE',
    nivelRiesgo: 'I',
    salario: 1_500_000 as unknown as AfiliacionInput['salario'],
    valorAdministracion: 50_000 as unknown as AfiliacionInput['valorAdministracion'],
    fechaIngreso: new Date('2026-01-15T00:00:00.000Z'),
    empresa: null,
    planSgss: { incluyeEps: true, incluyeAfp: true, incluyeArl: true, incluyeCcf: true },
    eps: { nombre: 'EPS SURA' },
    afp: { nombre: 'Colpensiones' },
    arl: { nombre: 'ARL SURA' },
    ccf: { nombre: 'Compensar' },
    ...overrides,
  };
}

// =====================================================================
// VINCULACION
// =====================================================================

describe('calcularLiquidacion · VINCULACION', () => {
  it('cobra solo Valor Administración (sin SGSS) cuando ingresa en el período', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2026-08-15T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r).not.toBeNull();
    expect(r!.tipo).toBe('VINCULACION');
    expect(r!.totalSgss).toBe(0);
    expect(r!.totalAdmon).toBe(50_000);
    expect(r!.totalGeneral).toBe(50_000);
    // Días = 31 - 15 = 16 (días desde el 15 hasta el 30 PILA)
    expect(r!.diasCotizados).toBe(16);
    expect(r!.diaDesde).toBe(15);
    expect(r!.diaHasta).toBe(30);
    // Solo un concepto ADMIN
    expect(r!.conceptos).toHaveLength(1);
    expect(r!.conceptos[0]!.concepto).toBe('ADMIN');
  });

  it('redondea Valor Administración al múltiplo de 100 hacia arriba', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-08-10T00:00:00.000Z'),
      valorAdministracion: 50_001 as unknown as AfiliacionInput['valorAdministracion'],
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    // 50_001 → ceil al múltiplo de 100 = 50_100
    expect(r!.totalAdmon).toBe(50_100);
  });

  it('respeta valorAdminOverride en vinculación', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2026-08-15T00:00:00.000Z') });
    const r = calcularLiquidacion(
      {
        afiliacion: af,
        periodo: PERIODO_AGO_2026,
        smlv: SMLV_2026,
        valorAdminOverride: 80_000,
      },
      tarifasBase,
      fspRangos,
    );
    expect(r!.totalAdmon).toBe(80_000);
  });

  it('cobra servicios adicionales en la vinculación', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-08-15T00:00:00.000Z'),
      serviciosAdicionales: [
        { id: 's1', codigo: 'EXAM_MED', nombre: 'Examen médico', precio: 120_000 },
        { id: 's2', codigo: 'DOTACION', nombre: 'Dotación', precio: 80_000 },
      ],
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r!.totalServicios).toBe(120_000 + 80_000);
    expect(r!.totalGeneral).toBe(50_000 + 120_000 + 80_000);
    expect(r!.conceptos.filter((c) => c.concepto === 'SERVICIO')).toHaveLength(2);
  });

  it('forzarTipo VINCULACION para emisión manual aún si ingresó hace meses', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2026-01-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      {
        afiliacion: af,
        periodo: PERIODO_AGO_2026,
        smlv: SMLV_2026,
        forzarTipo: 'VINCULACION',
      },
      tarifasBase,
      fspRangos,
    );
    expect(r!.tipo).toBe('VINCULACION');
    expect(r!.totalSgss).toBe(0);
  });
});

// =====================================================================
// MENSUALIDAD · DEPENDIENTE
// =====================================================================

describe('calcularLiquidacion · MENSUALIDAD DEPENDIENTE no exonerado', () => {
  it('cobra los 7 conceptos esperados (EPS+AFP+ARL+CCF+SENA+ICBF+ADMIN)', () => {
    // Ingresó en julio → mensualidad agosto completa
    const af = afiliacionDep({ fechaIngreso: new Date('2026-07-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r).not.toBeNull();
    expect(r!.tipo).toBe('MENSUALIDAD');
    expect(r!.diasCotizados).toBe(30);
    const conceptosEsperados = ['EPS', 'AFP', 'ARL', 'CCF', 'SENA', 'ICBF', 'ADMIN'];
    expect(r!.conceptos.map((c) => c.concepto).sort()).toEqual(conceptosEsperados.sort());
  });

  it('IBC=1_500_000 → totales redondeados al múltiplo de 100', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2026-07-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    // Cada concepto debe terminar en 00
    for (const c of r!.conceptos) {
      expect(c.valor % 100, `${c.concepto}=${c.valor} no es múltiplo de 100`).toBe(0);
    }
    expect(r!.totalSgss % 100).toBe(0);
    expect(r!.totalGeneral % 100).toBe(0);
  });

  it('totalSgss = suma de EPS+AFP+ARL+CCF+SENA+ICBF (sin ADMIN ni SERVICIO)', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2026-07-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    const sgssEsperado = r!.conceptos
      .filter((c) => ['EPS', 'AFP', 'ARL', 'CCF', 'SENA', 'ICBF', 'FSP'].includes(c.concepto))
      .reduce((s, c) => s + c.valor, 0);
    expect(r!.totalSgss).toBe(sgssEsperado);
    expect(r!.totalGeneral).toBe(r!.totalSgss + r!.totalAdmon + r!.totalServicios);
  });

  it('subconcepto EPS usa el nombre de la EPS de la afiliación', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      eps: { nombre: 'Sanitas EPS' },
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    const eps = r!.conceptos.find((c) => c.concepto === 'EPS');
    expect(eps?.subconcepto).toBe('Sanitas EPS');
  });

  it('aCargoEmpleador: EPS/AFP/ARL/CCF/SENA/ICBF a empleador, ADMIN también', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2026-07-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    for (const c of r!.conceptos) {
      // En dependiente, todos los conceptos calculados aquí son del empleador.
      expect(c.aCargoEmpleador, `${c.concepto} debería ser del empleador`).toBe(true);
    }
  });
});

describe('calcularLiquidacion · MENSUALIDAD DEPENDIENTE exonerado (Ley 1607)', () => {
  it('usa la tarifa EPS exonerada (4%) y NO cobra SENA ni ICBF', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      empresa: {
        id: 'emp1',
        exoneraLey1607: true,
        arl: { nombre: 'ARL SURA' },
      },
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    const eps = r!.conceptos.find((c) => c.concepto === 'EPS');
    expect(eps?.porcentaje).toBe(4);
    expect(r!.conceptos.find((c) => c.concepto === 'SENA')).toBeUndefined();
    expect(r!.conceptos.find((c) => c.concepto === 'ICBF')).toBeUndefined();
  });
});

// =====================================================================
// MENSUALIDAD · INDEPENDIENTE
// =====================================================================

describe('calcularLiquidacion · MENSUALIDAD INDEPENDIENTE', () => {
  it('NO cobra SENA ni ICBF, ni siquiera cuando exoneración=false', () => {
    const af = afiliacionIndep({ fechaIngreso: new Date('2026-07-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r!.conceptos.find((c) => c.concepto === 'SENA')).toBeUndefined();
    expect(r!.conceptos.find((c) => c.concepto === 'ICBF')).toBeUndefined();
  });

  it('ARL viene de afiliacion.arl (no de empresa)', () => {
    const af = afiliacionIndep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      arl: { nombre: 'ARL Positiva' },
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    const arl = r!.conceptos.find((c) => c.concepto === 'ARL');
    expect(arl?.subconcepto).toBe('ARL Positiva');
  });

  it('aCargoEmpleador=false en TODOS los conceptos (el indep es su propio empleador)', () => {
    const af = afiliacionIndep({ fechaIngreso: new Date('2026-07-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    for (const c of r!.conceptos) {
      expect(c.aCargoEmpleador, `${c.concepto} no debería ser del empleador`).toBe(false);
    }
  });
});

// =====================================================================
// FSP (Fondo Solidaridad Pensional)
// =====================================================================

describe('calcularLiquidacion · FSP', () => {
  it('IBC < 4 SMLV → sin FSP', () => {
    // 1.5M / 1.3M = 1.15 SMLV → bajo el umbral 4 SMLV
    const af = afiliacionDep({ fechaIngreso: new Date('2026-07-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r!.conceptos.find((c) => c.concepto === 'FSP')).toBeUndefined();
  });

  it('IBC entre 4 y 16 SMLV → FSP 1%', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      salario: (SMLV_2026 * 10) as unknown as AfiliacionInput['salario'],
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    const fsp = r!.conceptos.find((c) => c.concepto === 'FSP');
    expect(fsp).toBeDefined();
    expect(fsp!.porcentaje).toBe(1);
    expect(fsp!.aCargoEmpleador).toBe(false);
  });

  it('IBC > 17 SMLV → FSP 2% (tramo superior)', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      salario: (SMLV_2026 * 20) as unknown as AfiliacionInput['salario'],
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    const fsp = r!.conceptos.find((c) => c.concepto === 'FSP');
    expect(fsp?.porcentaje).toBe(2);
  });
});

// =====================================================================
// Plan SGSS parcial
// =====================================================================

describe('calcularLiquidacion · plan SGSS parcial', () => {
  it('plan sin EPS → no se cobra EPS', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      planSgss: { incluyeEps: false, incluyeAfp: true, incluyeArl: true, incluyeCcf: true },
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r!.conceptos.find((c) => c.concepto === 'EPS')).toBeUndefined();
  });

  it('plan sin AFP → no se cobra AFP ni FSP', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      salario: (SMLV_2026 * 10) as unknown as AfiliacionInput['salario'],
      planSgss: { incluyeEps: true, incluyeAfp: false, incluyeArl: true, incluyeCcf: true },
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r!.conceptos.find((c) => c.concepto === 'AFP')).toBeUndefined();
    expect(r!.conceptos.find((c) => c.concepto === 'FSP')).toBeUndefined();
  });

  it('plan sin CCF → se cobra CCF interno de $100 (fijo, no porcentual)', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      planSgss: { incluyeEps: true, incluyeAfp: true, incluyeArl: true, incluyeCcf: false },
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    const ccf = r!.conceptos.find((c) => c.concepto === 'CCF');
    expect(ccf).toBeDefined();
    expect(ccf!.valor).toBe(100);
    expect(ccf!.subconcepto).toBe('CCF interno');
  });

  it('plan sin ARL + aplicaArlObligatoria → se cobra ARL nivel I de 1 día', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      planSgss: { incluyeEps: true, incluyeAfp: true, incluyeArl: false, incluyeCcf: true },
    });
    const r = calcularLiquidacion(
      {
        afiliacion: af,
        periodo: PERIODO_AGO_2026,
        smlv: SMLV_2026,
        aplicaArlObligatoria: true,
      },
      tarifasBase,
      fspRangos,
    );
    const arl = r!.conceptos.find((c) => c.concepto === 'ARL');
    expect(arl).toBeDefined();
    expect(arl!.subconcepto).toBe('ARL Nivel I (interno · 1 día)');
    // base = IBC / 30 = 1_500_000 / 30 = 50_000
    expect(arl!.base).toBe(50_000);
  });

  it('plan sin ARL + aplicaArlObligatoria=false → no se cobra ARL', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      planSgss: { incluyeEps: true, incluyeAfp: true, incluyeArl: false, incluyeCcf: true },
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r!.conceptos.find((c) => c.concepto === 'ARL')).toBeUndefined();
  });

  it('plan null → todos los conceptos por default (protección por omisión)', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      planSgss: null,
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    // Todos los SGSS deberían cobrarse
    for (const c of ['EPS', 'AFP', 'ARL', 'CCF'] as const) {
      expect(
        r!.conceptos.find((x) => x.concepto === c),
        `falta ${c}`,
      ).toBeDefined();
    }
  });
});

// =====================================================================
// Días proporcionales
// =====================================================================

describe('calcularLiquidacion · días proporcionales', () => {
  it('ingreso día 1 → vinculación 30 días completos', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2026-08-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r!.tipo).toBe('VINCULACION');
    expect(r!.diasCotizados).toBe(30);
  });

  it('ingreso día 20 → vinculación 11 días', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2026-08-20T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r!.diasCotizados).toBe(11);
    expect(r!.diaDesde).toBe(20);
    expect(r!.diaHasta).toBe(30);
  });

  it('ingreso día 31 → PILA recorta a día 30 (1 día)', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2026-08-31T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r!.diasCotizados).toBe(1);
  });

  it('diasCotizadosOverride aplicado a mensualidad (retiro a mitad de mes)', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2026-01-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      {
        afiliacion: af,
        periodo: PERIODO_AGO_2026,
        smlv: SMLV_2026,
        diasCotizadosOverride: 15,
      },
      tarifasBase,
      fspRangos,
    );
    expect(r!.diasCotizados).toBe(15);
    // Base = IBC * 15/30 = 1_500_000 * 0.5 = 750_000
    expect(r!.baseCotizacion).toBe(750_000);
  });

  it('diasCotizadosOverride capado a 30', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2026-01-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      {
        afiliacion: af,
        periodo: PERIODO_AGO_2026,
        smlv: SMLV_2026,
        diasCotizadosOverride: 45,
      },
      tarifasBase,
      fspRangos,
    );
    expect(r!.diasCotizados).toBe(30);
  });
});

// =====================================================================
// Casos límite / fechas
// =====================================================================

describe('calcularLiquidacion · casos límite', () => {
  it('afiliación con fecha futura → null (aún no arranca)', () => {
    const af = afiliacionDep({ fechaIngreso: new Date('2027-01-01T00:00:00.000Z') });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r).toBeNull();
  });

  it('tarifa faltante → emite advertencia, no rompe', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      nivelRiesgo: 'V', // no hay tarifa ARL nivel V en el fixture
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r).not.toBeNull();
    expect(r!.advertencias.some((a) => a.includes('ARL'))).toBe(true);
    // ARL no se debería haber cobrado (no había tarifa)
    expect(r!.conceptos.find((c) => c.concepto === 'ARL')).toBeUndefined();
  });

  it('mensualidad sin valor administración → no se agrega concepto ADMIN', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      valorAdministracion: 0 as unknown as AfiliacionInput['valorAdministracion'],
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    expect(r!.conceptos.find((c) => c.concepto === 'ADMIN')).toBeUndefined();
    expect(r!.totalAdmon).toBe(0);
  });

  it('servicios con precio 0 se ignoran (no se agregan al desglose)', () => {
    const af = afiliacionDep({
      fechaIngreso: new Date('2026-07-01T00:00:00.000Z'),
      serviciosAdicionales: [
        { id: 's1', codigo: 'X', nombre: 'Servicio gratis', precio: 0 },
        { id: 's2', codigo: 'Y', nombre: 'Servicio pago', precio: 5_000 },
      ],
    });
    const r = calcularLiquidacion(
      { afiliacion: af, periodo: PERIODO_AGO_2026, smlv: SMLV_2026 },
      tarifasBase,
      fspRangos,
    );
    const servicios = r!.conceptos.filter((c) => c.concepto === 'SERVICIO');
    expect(servicios).toHaveLength(1);
    expect(servicios[0]!.subconcepto).toContain('Servicio pago');
  });
});

// =====================================================================
// periodoAporte distinto del periodo contable
// =====================================================================

describe('calcularLiquidacion · periodoAporte ≠ periodo contable', () => {
  it('factura en septiembre con periodoAporte=agosto → días por agosto', () => {
    // Indep ingresó 20-ago; en septiembre se factura el aporte de agosto
    const af = afiliacionIndep({ fechaIngreso: new Date('2026-08-20T00:00:00.000Z') });
    const r = calcularLiquidacion(
      {
        afiliacion: af,
        periodo: { anio: 2026, mes: 9 },
        periodoAporte: PERIODO_AGO_2026,
        smlv: SMLV_2026,
      },
      tarifasBase,
      fspRangos,
    );
    // Debe ser VINCULACION (el aporte es de su primer mes) con días desde 20 hasta 30
    expect(r!.tipo).toBe('VINCULACION');
    expect(r!.diasCotizados).toBe(11);
  });
});
