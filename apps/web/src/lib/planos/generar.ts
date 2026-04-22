import type { Prisma, TipoPlanilla } from '@pila/db';
import {
  padNum,
  padAlpha,
  padMoney,
  padDate,
  padPeriodo,
  padTarifa,
  blank,
  shiftMes,
  assertLength,
  normalizeText,
} from './format';
import {
  tipoDocPila,
  tipoDocAportantePila,
  tipoCotizantePila,
  subtipoCotizantePila,
  claseRiesgoPila,
  exoneraLey1607Pila,
} from './codigos';

/**
 * Genera el archivo plano PILA según resolución 2388/2016:
 *   - 1 línea registro tipo 01 (encabezado, 359 bytes)
 *   - N líneas registro tipo 02 (cotizantes, 676 bytes c/u)
 *   - Padding extra de 17 espacios por línea → total 693 (coincide con el
 *     plano ejemplo del operador). Son bytes reservados del operador.
 *
 * La función recibe una Planilla con todas sus relaciones pobladas por el
 * caller (el route handler). Es pura y testeable.
 */

export const ENCABEZADO_LEN = 359;
export const COTIZANTE_LEN = 676;
export const PADDING_OPERADOR_LEN = 17;
export const LINEA_LEN = COTIZANTE_LEN + PADDING_OPERADOR_LEN; // 693

// ============ Tipo de datos esperado por el generador ============

export type PlanillaConDatos = Prisma.PlanillaGetPayload<{
  include: {
    periodo: true;
    empresa: {
      include: {
        departamentoRef: { select: { codigo: true } };
        municipioRef: { select: { codigo: true } };
        arl: { select: { codigo: true } };
      };
    };
    cotizante: {
      include: {
        departamento: { select: { codigo: true } };
        municipio: { select: { codigo: true } };
      };
    };
    comprobantes: {
      include: {
        comprobante: {
          include: {
            liquidaciones: {
              include: {
                liquidacion: {
                  include: {
                    afiliacion: {
                      include: {
                        cotizante: {
                          include: {
                            departamento: { select: { codigo: true } };
                            municipio: { select: { codigo: true } };
                          };
                        };
                        empresa: {
                          include: {
                            departamentoRef: { select: { codigo: true } };
                            municipioRef: { select: { codigo: true } };
                            arl: { select: { codigo: true } };
                          };
                        };
                        eps: { select: { codigo: true } };
                        afp: { select: { codigo: true } };
                        arl: { select: { codigo: true } };
                        ccf: { select: { codigo: true } };
                      };
                    };
                    conceptos: true;
                  };
                };
              };
            };
          };
        };
      };
    };
  };
}>;

// ============ Agregador auxiliar de conceptos ============

type ConceptosLiq = { concepto: string; porcentaje: number; valor: number }[];

function suma(
  conceptos: ConceptosLiq,
  concepto: string,
  incluyeInterno: boolean = false,
): number {
  return conceptos.reduce((s, c) => {
    if (c.concepto !== concepto) return s;
    // Identificar "interno" no es inferible aquí sin el subconcepto.
    // Pasamos `incluyeInterno` a false por default (lo normal: solo real).
    return s + c.valor;
  }, 0);
}

function primero(
  conceptos: ConceptosLiq,
  concepto: string,
): { porcentaje: number; valor: number } | null {
  const c = conceptos.find((x) => x.concepto === concepto);
  return c ? { porcentaje: c.porcentaje, valor: c.valor } : null;
}

// ============ Encabezado (registro tipo 01) ============

export function construirEncabezado(
  planilla: PlanillaConDatos,
  totalEmpleados: number,
  totalNomina: number,
): string {
  // 1. Razón social del aportante, tipo doc, número, DV
  let razonSocial: string;
  let tipoDocAportante: string;
  let numeroDocAportante: string;
  let dvAportante: string;
  let codSucursal: string;
  let nombreSucursal: string;
  let codArl: string;

  if (planilla.tipoPlanilla === 'E' && planilla.empresa) {
    razonSocial = planilla.empresa.nombre;
    tipoDocAportante = 'NI';
    numeroDocAportante = planilla.empresa.nit ?? '';
    dvAportante = planilla.empresa.dv ?? '0';
    // Sucursal y ARL del empleador
    codSucursal = planilla.empresa.municipioRef?.codigo ?? '';
    nombreSucursal = planilla.empresa.ciudad ?? '';
    codArl = planilla.empresa.arl?.codigo ?? '';
  } else if (planilla.cotizante) {
    // Independiente: aportante es la persona natural
    const c = planilla.cotizante;
    razonSocial = [c.primerNombre, c.segundoNombre, c.primerApellido, c.segundoApellido]
      .filter(Boolean)
      .join(' ');
    tipoDocAportante = tipoDocAportantePila(c.tipoDocumento);
    numeroDocAportante = c.numeroDocumento;
    dvAportante = '0';
    codSucursal = c.municipio?.codigo ?? '';
    nombreSucursal = ''; // para independiente no aplica
    codArl = '';
    // El ARL del independiente se toma de la primera liquidación (afiliación)
    const primeraLiq = planilla.comprobantes[0]?.comprobante.liquidaciones[0]?.liquidacion;
    if (primeraLiq?.afiliacion.arl) {
      codArl = primeraLiq.afiliacion.arl.codigo;
    }
  } else {
    throw new Error(
      `Planilla ${planilla.consecutivo} sin aportante (empresa o cotizante)`,
    );
  }

  // Período salud: para E es el mes siguiente al de aporte; para I es el
  // mismo del aporte (el indep paga por el mes en que cotiza).
  const periodoOtros = padPeriodo(
    planilla.periodoAporteAnio,
    planilla.periodoAporteMes,
  );
  const { anio: saludAnio, mes: saludMes } =
    planilla.tipoPlanilla === 'E' || planilla.tipoPlanilla === 'A' ||
    planilla.tipoPlanilla === 'Y'
      ? shiftMes(planilla.periodoAporteAnio, planilla.periodoAporteMes, 1)
      : { anio: planilla.periodoAporteAnio, mes: planilla.periodoAporteMes };
  const periodoSalud = padPeriodo(saludAnio, saludMes);

  const parts: string[] = [];
  parts.push('01'); // 1 · Tipo registro (2)
  parts.push('1'); // 2 · Modalidad (1=Electrónica)
  parts.push(padNum(1, 4)); // 3 · Secuencia (4) — solo 1 registro tipo 01
  parts.push(padAlpha(razonSocial, 200)); // 4 · Razón social (200)
  parts.push(padAlpha(tipoDocAportante, 2)); // 5 · Tipo doc aportante (2)
  parts.push(padAlpha(numeroDocAportante, 16)); // 6 · Num doc aportante (16)
  parts.push(padNum(Number(dvAportante) || 0, 1)); // 7 · DV (1)
  parts.push(padAlpha(planilla.tipoPlanilla, 1)); // 8 · Tipo planilla (1)
  parts.push(blank(10)); // 9 · Número planilla asociada (10)
  parts.push(blank(10)); // 10 · Fecha pago planilla asociada (10)
  parts.push('U'); // 11 · Forma presentación (1) — U = única desagregada
  parts.push(padAlpha(codSucursal, 10)); // 12 · Código sucursal (10)
  parts.push(padAlpha(nombreSucursal, 40)); // 13 · Nombre sucursal (40)
  parts.push(padAlpha(codArl, 6)); // 14 · Código ARL (6)
  parts.push(periodoOtros); // 15 · Período otros (7)
  parts.push(periodoSalud); // 16 · Período salud (7)
  parts.push(padNum(0, 10)); // 17 · Número radicación (10) — lo asigna el operador
  parts.push(blank(10)); // 18 · Fecha pago (10) — lo asigna el operador al pagar
  parts.push(padNum(totalEmpleados, 5)); // 19 · Total empleados (5)
  parts.push(padMoney(totalNomina, 12)); // 20 · Valor total nómina (12)
  parts.push(padNum(1, 2)); // 21 · Tipo aportante (2) — 1=Empleador

  // 22 · Código operador (2). Nuestro sistema no envía vía operador, dejamos
  // "00" como valor neutro. El aportante sube el archivo al portal del
  // operador, que escribe este campo al validar.
  parts.push('00');

  const linea = parts.join('');
  return assertLength(linea, ENCABEZADO_LEN, 'encabezado');
}

// ============ Línea cotizante (registro tipo 02) ============

export type DatosCotizante = {
  secuencia: number; // 1..N
  // Identificación del cotizante
  tipoDoc: string;
  numeroDoc: string;
  primerNombre: string;
  segundoNombre: string | null;
  primerApellido: string;
  segundoApellido: string | null;
  // Ubicación laboral (depto/muni DIVIPOLA de 2/3 dígitos)
  codDepto: string;
  codMuni: string;
  // Afiliación
  modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
  nivelRiesgo: 'I' | 'II' | 'III' | 'IV' | 'V' | null;
  empresaExonera: boolean;
  fechaIngreso: Date;
  fechaRetiro: Date | null;
  // Entidades
  codAfp: string;
  codEps: string;
  codArl: string;
  codCcf: string;
  // Liquidación
  diasCotizados: number;
  ibc: number;
  salario: number;
  // Novedades (ING=X si es primera factura, RET=X si retiro)
  aplicaIngreso: boolean;
  aplicaRetiro: boolean;
  // Tarifas (porcentajes tal como se guardan en BD: 12.5 = 12.5%)
  tarifaPension: number;
  tarifaSalud: number;
  tarifaArl: number;
  tarifaCcf: number;
  tarifaSena: number;
  tarifaIcbf: number;
  // Valores
  valorPension: number;
  valorSalud: number;
  valorArl: number;
  valorCcf: number;
  valorSena: number;
  valorIcbf: number;
  valorFsp: number; // subcuenta solidaridad
  valorSubsistencia: number;
  // Contexto
  smlv: number;
};

export function construirCotizante(d: DatosCotizante): string {
  const ing = d.aplicaIngreso ? 'X' : ' ';
  const ret = d.aplicaRetiro ? 'X' : ' ';

  const exonera = exoneraLey1607Pila({
    modalidad: d.modalidad,
    empresaExonera: d.empresaExonera,
    ibcSalud: d.ibc,
    smlv: d.smlv,
  });

  const totalPension = Math.round(d.valorPension); // 47+48+49 (no manejamos voluntarios)

  const parts: string[] = [];
  parts.push('02'); // 1 · Tipo registro
  parts.push(padNum(d.secuencia, 5)); // 2 · Secuencia
  parts.push(padAlpha(d.tipoDoc, 2)); // 3 · Tipo doc
  parts.push(padAlpha(d.numeroDoc, 16)); // 4 · Num doc
  parts.push(tipoCotizantePila(d.modalidad)); // 5 · Tipo cotizante (2)
  parts.push(subtipoCotizantePila()); // 6 · Subtipo (2)
  parts.push(' '); // 7 · Extranjero no obligado (1)
  parts.push(' '); // 8 · Colombiano exterior (1)
  parts.push(padAlpha(d.codDepto, 2)); // 9 · Cód depto (2)
  parts.push(padAlpha(d.codMuni, 3)); // 10 · Cód muni (3)
  parts.push(padAlpha(d.primerApellido, 20)); // 11
  parts.push(padAlpha(d.segundoApellido, 30)); // 12
  parts.push(padAlpha(d.primerNombre, 20)); // 13
  parts.push(padAlpha(d.segundoNombre, 30)); // 14
  parts.push(ing); // 15 · ING
  parts.push(ret); // 16 · RET
  parts.push(' '); // 17 · TDE (traslado desde EPS)
  parts.push(' '); // 18 · TAE (traslado a EPS)
  parts.push(' '); // 19 · TDP (traslado desde AFP)
  parts.push(' '); // 20 · TAP (traslado a AFP)
  parts.push(' '); // 21 · VSP
  parts.push(' '); // 22 · Correcciones
  parts.push(' '); // 23 · VST
  parts.push(' '); // 24 · SLN
  parts.push(' '); // 25 · IGE
  parts.push(' '); // 26 · LMA
  parts.push(' '); // 27 · VAC-LR
  parts.push(' '); // 28 · AVP
  parts.push(' '); // 29 · VCT
  parts.push(padNum(0, 2)); // 30 · IRL días
  parts.push(padAlpha(d.codAfp, 6)); // 31 · Cód AFP
  parts.push(blank(6)); // 32 · Cód AFP destino
  parts.push(padAlpha(d.codEps, 6)); // 33 · Cód EPS
  parts.push(blank(6)); // 34 · Cód EPS destino
  parts.push(padAlpha(d.codCcf, 6)); // 35 · Cód CCF
  parts.push(padNum(d.diasCotizados, 2)); // 36 · Días pensión
  parts.push(padNum(d.diasCotizados, 2)); // 37 · Días salud
  parts.push(padNum(d.diasCotizados, 2)); // 38 · Días ARL
  parts.push(padNum(d.diasCotizados, 2)); // 39 · Días CCF
  parts.push(padMoney(d.salario, 9)); // 40 · Salario básico
  parts.push(' '); // 41 · Salario integral (blanco = no)
  parts.push(padMoney(d.ibc, 9)); // 42 · IBC pensión
  parts.push(padMoney(d.ibc, 9)); // 43 · IBC salud
  parts.push(padMoney(d.ibc, 9)); // 44 · IBC ARL
  parts.push(padMoney(d.ibc, 9)); // 45 · IBC CCF
  parts.push(padTarifa(d.tarifaPension, 7)); // 46 · Tarifa pensión (7: 0.NNNN + extra dígito)
  parts.push(padMoney(d.valorPension, 9)); // 47 · Cotización obligatoria pensión
  parts.push(padMoney(0, 9)); // 48 · Aporte voluntario afiliado
  parts.push(padMoney(0, 9)); // 49 · Aporte voluntario aportante
  parts.push(padMoney(totalPension, 9)); // 50 · Total cotización pensión
  parts.push(padMoney(d.valorFsp, 9)); // 51 · FSP solidaridad
  parts.push(padMoney(d.valorSubsistencia, 9)); // 52 · FSP subsistencia
  parts.push(padMoney(0, 9)); // 53 · Valor no retenido aportes voluntarios
  parts.push(padTarifa(d.tarifaSalud, 7)); // 54 · Tarifa salud
  parts.push(padMoney(d.valorSalud, 9)); // 55 · Cotización obligatoria salud
  parts.push(padMoney(0, 9)); // 56 · Valor UPC adicional
  parts.push(blank(15)); // 57 · N° autorización incapacidad
  parts.push(padMoney(0, 9)); // 58 · Valor incapacidad
  parts.push(blank(15)); // 59 · N° autorización licencia
  parts.push(padMoney(0, 9)); // 60 · Valor licencia maternidad
  parts.push(padTarifa(d.tarifaArl, 9)); // 61 · Tarifa ARL (9 porque ARL usa 6 decimales)
  parts.push(padAlpha('0000000', 9)); // 62 · Centro de trabajo
  parts.push(padMoney(d.valorArl, 9)); // 63 · Cotización ARL
  parts.push(padTarifa(d.tarifaCcf, 7)); // 64 · Tarifa CCF
  parts.push(padMoney(d.valorCcf, 9)); // 65 · Valor aporte CCF
  parts.push(padTarifa(d.tarifaSena, 7)); // 66 · Tarifa SENA
  parts.push(padMoney(d.valorSena, 9)); // 67 · Valor SENA
  parts.push(padTarifa(d.tarifaIcbf, 7)); // 68 · Tarifa ICBF
  parts.push(padMoney(d.valorIcbf, 9)); // 69 · Valor ICBF
  parts.push(padTarifa(0, 7)); // 70 · Tarifa ESAP
  parts.push(padMoney(0, 9)); // 71 · Valor ESAP
  parts.push(padTarifa(0, 7)); // 72 · Tarifa MEN
  parts.push(padMoney(0, 9)); // 73 · Valor MEN
  parts.push(blank(2)); // 74 · Tipo doc cot principal
  parts.push(blank(16)); // 75 · Num doc cot principal
  parts.push(exonera); // 76 · Exonera Ley 1607 (S/N)
  parts.push(padAlpha(d.codArl, 6)); // 77 · Cód ARL
  parts.push(claseRiesgoPila(d.nivelRiesgo)); // 78 · Clase riesgo
  parts.push(' '); // 79 · Indicador tarifa especial pensiones
  parts.push(d.aplicaIngreso ? padDate(d.fechaIngreso) : blank(10)); // 80 · Fecha ingreso
  parts.push(d.aplicaRetiro ? padDate(d.fechaRetiro) : blank(10)); // 81 · Fecha retiro
  parts.push(blank(10)); // 82 · Fecha inicio VSP
  parts.push(blank(10)); // 83 · Fecha inicio SLN
  parts.push(blank(10)); // 84 · Fecha fin SLN
  parts.push(blank(10)); // 85 · Fecha inicio IGE
  parts.push(blank(10)); // 86 · Fecha fin IGE
  parts.push(blank(10)); // 87 · Fecha inicio LMA
  parts.push(blank(10)); // 88 · Fecha fin LMA
  parts.push(blank(10)); // 89 · Fecha inicio VAC-LR
  parts.push(blank(10)); // 90 · Fecha fin VAC-LR
  parts.push(blank(10)); // 91 · Fecha inicio VCT
  parts.push(blank(10)); // 92 · Fecha fin VCT
  parts.push(blank(10)); // 93 · Fecha inicio IRL
  parts.push(blank(10)); // 94 · Fecha fin IRL
  parts.push(padMoney(d.ibc, 9)); // 95 · IBC otros parafiscales
  parts.push(padNum(0, 3)); // 96 · N° horas laboradas

  // Padding reservado del operador (17 bytes)
  parts.push(blank(PADDING_OPERADOR_LEN));

  const linea = parts.join('');
  return assertLength(linea, LINEA_LEN, `cotizante #${d.secuencia}`);
}

// ============ Orquestador ============

export type GeneracionPlano = {
  contenido: string; // todo el archivo en memoria
  totalCotizantes: number;
  totalNomina: number;
  filename: string;
};

export function generarPlano(planilla: PlanillaConDatos): GeneracionPlano {
  // Construir las líneas de cotizante primero para poder calcular totales
  const lineasCot: string[] = [];
  const cotizantesUnicos = new Set<string>();
  let totalNomina = 0;

  // Un comprobante puede tener varias liquidaciones (p.ej. empresa CC).
  // Iteramos todas. Ordenamos por cotizante + fecha para que la secuencia
  // sea determinista.
  type Item = {
    cotizanteId: string;
    key: string; // para ordenar
    datos: DatosCotizante;
  };

  const items: Item[] = [];

  for (const cp of planilla.comprobantes) {
    const comp = cp.comprobante;
    const aplicaRetiroComp = comp.aplicaNovedadRetiro;

    for (const cl of comp.liquidaciones) {
      const liq = cl.liquidacion;
      const af = liq.afiliacion;
      const c = af.cotizante;

      // Detectar novedad de ingreso: si la fechaIngreso cae dentro del
      // período de aporte (primer mes de la afiliación).
      const fi = new Date(af.fechaIngreso);
      const mesPlanilla = planilla.periodoAporteMes;
      const anioPlanilla = planilla.periodoAporteAnio;
      const aplicaIngreso =
        fi.getUTCFullYear() === anioPlanilla &&
        fi.getUTCMonth() + 1 === mesPlanilla;

      // Retiro: comprobante marcado con novedad de retiro O afiliación con
      // fechaRetiro dentro del período.
      const fr = af.fechaRetiro ? new Date(af.fechaRetiro) : null;
      const aplicaRetiro =
        aplicaRetiroComp ||
        (fr !== null &&
          fr.getUTCFullYear() === anioPlanilla &&
          fr.getUTCMonth() + 1 === mesPlanilla);

      // Conceptos: tomamos los NO internos (los internos son cobro del
      // aliado, no van al operador PILA).
      const conceptos = liq.conceptos
        .filter((x) => !x.subconcepto?.toLowerCase().includes('interno'))
        .map((x) => ({
          concepto: x.concepto,
          porcentaje: Number(x.porcentaje),
          valor: Number(x.valor),
        }));

      const eps = primero(conceptos, 'EPS');
      const afp = primero(conceptos, 'AFP');
      const arl = primero(conceptos, 'ARL');
      const ccf = primero(conceptos, 'CCF');
      const sena = primero(conceptos, 'SENA');
      const icbf = primero(conceptos, 'ICBF');
      const fsp = primero(conceptos, 'FSP');

      const ibc = Number(liq.ibc);
      totalNomina += ibc;
      cotizantesUnicos.add(c.id);

      // Para dependiente, el ARL y el municipio laboral vienen de la
      // empresa; para independiente, de su propia afiliación.
      const esDep = af.modalidad === 'DEPENDIENTE';
      const empresa = af.empresa;
      const codDepto = esDep
        ? empresa?.departamentoRef?.codigo ?? ''
        : c.departamento?.codigo ?? '';
      const codMuni = esDep
        ? empresa?.municipioRef?.codigo ?? ''
        : c.municipio?.codigo ?? '';
      const codArl = esDep
        ? empresa?.arl?.codigo ?? af.arl?.codigo ?? ''
        : af.arl?.codigo ?? '';

      const datos: DatosCotizante = {
        secuencia: 0, // se asigna después al ordenar
        tipoDoc: tipoDocPila(c.tipoDocumento),
        numeroDoc: c.numeroDocumento,
        primerNombre: c.primerNombre,
        segundoNombre: c.segundoNombre,
        primerApellido: c.primerApellido,
        segundoApellido: c.segundoApellido,
        codDepto,
        codMuni,
        modalidad: af.modalidad,
        nivelRiesgo: af.nivelRiesgo,
        empresaExonera: empresa?.exoneraLey1607 ?? false,
        fechaIngreso: fi,
        fechaRetiro: fr,
        codAfp: af.afp?.codigo ?? '',
        codEps: af.eps?.codigo ?? '',
        codArl,
        codCcf: af.ccf?.codigo ?? '',
        diasCotizados: liq.diasCotizados,
        ibc,
        salario: Number(af.salario),
        aplicaIngreso,
        aplicaRetiro,
        tarifaPension: afp?.porcentaje ?? 0,
        tarifaSalud: eps?.porcentaje ?? 0,
        tarifaArl: arl?.porcentaje ?? 0,
        tarifaCcf: ccf?.porcentaje ?? 0,
        tarifaSena: sena?.porcentaje ?? 0,
        tarifaIcbf: icbf?.porcentaje ?? 0,
        valorPension: afp?.valor ?? 0,
        valorSalud: eps?.valor ?? 0,
        valorArl: arl?.valor ?? 0,
        valorCcf: ccf?.valor ?? 0,
        valorSena: sena?.valor ?? 0,
        valorIcbf: icbf?.valor ?? 0,
        valorFsp: fsp?.valor ?? 0,
        valorSubsistencia: 0,
        smlv: Number(planilla.periodo.smlvSnapshot),
      };

      items.push({
        cotizanteId: c.id,
        key: `${c.primerApellido}|${c.primerNombre}|${c.numeroDocumento}`,
        datos,
      });
    }
  }

  // Ordenar por apellido/nombre para consistencia y asignar secuencia
  items.sort((a, b) => a.key.localeCompare(b.key));
  items.forEach((it, i) => {
    it.datos.secuencia = i + 1;
    lineasCot.push(construirCotizante(it.datos));
  });

  const encabezado = construirEncabezado(
    planilla,
    cotizantesUnicos.size,
    totalNomina,
  );

  const contenido = [encabezado, ...lineasCot].join('\r\n') + '\r\n';

  // Nombre del archivo: PLN-000001_EMPRESA_2026-03.txt
  const aportante =
    planilla.empresa?.nombre ??
    (planilla.cotizante
      ? `${planilla.cotizante.primerApellido}_${planilla.cotizante.primerNombre}`
      : 'APORTANTE');
  const slug = normalizeText(aportante)
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_\-]/g, '')
    .slice(0, 40);
  const periodo = padPeriodo(planilla.periodoAporteAnio, planilla.periodoAporteMes);
  const filename = `${planilla.consecutivo}_${slug}_${periodo}.txt`;

  return {
    contenido,
    totalCotizantes: cotizantesUnicos.size,
    totalNomina,
    filename,
  };
}
