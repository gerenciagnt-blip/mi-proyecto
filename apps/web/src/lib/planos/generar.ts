import type { Prisma, TipoPlanilla, Regimen } from '@pila/db';
import { calcularDV } from '@/lib/nit';
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
import { tipoDocPila, tipoDocAportantePila, claseRiesgoPila, exoneraLey1607Pila } from './codigos';
import { banderasSubsistemas, identificacionForzada, aplicaOmisionPension } from './politicas';

/**
 * Genera el archivo plano PILA según resolución 2388/2016:
 *   - 1 línea registro tipo 01 (encabezado, 359 bytes)
 *   - N líneas registro tipo 02 (cotizantes, 676 + 17 padding = 693 bytes)
 *
 * Aplica políticas por tipo de planilla (E/I/K, régimen ORDINARIO vs
 * RESOLUCION) y reglas transversales (omisión pensión por subtipo,
 * exoneración Ley 1607, IBC CCF simbólico $1 si plan no incluye CCF,
 * split de línea por ING/RET en plan sin ARL con días ≥ 2).
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
        arl: { select: { codigo: true; codigoMinSalud: true } };
      };
    };
    cotizante: {
      include: {
        departamento: { select: { codigo: true } };
        municipio: { select: { codigo: true } };
      };
    };
    sucursal: { select: { codigo: true; nombre: true } };
    createdBy: {
      include: {
        sucursal: { select: { codigo: true; nombre: true } };
      };
    };
    comprobantes: {
      include: {
        comprobante: {
          include: {
            cuentaCobro: {
              include: {
                sucursal: { select: { codigo: true; nombre: true } };
              };
            };
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
                            arl: { select: { codigo: true; codigoMinSalud: true } };
                          };
                        };
                        tipoCotizante: { select: { codigo: true } };
                        subtipo: { select: { codigo: true } };
                        planSgss: {
                          select: {
                            incluyeEps: true;
                            incluyeAfp: true;
                            incluyeArl: true;
                            incluyeCcf: true;
                          };
                        };
                        actividadEconomica: { select: { codigoCiiu: true } };
                        eps: { select: { codigo: true; codigoMinSalud: true } };
                        afp: { select: { codigo: true; codigoMinSalud: true } };
                        arl: { select: { codigo: true; codigoMinSalud: true } };
                        ccf: { select: { codigo: true; codigoMinSalud: true } };
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

// ============ Helpers internos ============

type ConceptosLiq = { concepto: string; porcentaje: number; valor: number }[];

function primero(
  conceptos: ConceptosLiq,
  concepto: string,
): { porcentaje: number; valor: number } | null {
  const c = conceptos.find((x) => x.concepto === concepto);
  return c ? { porcentaje: c.porcentaje, valor: c.valor } : null;
}

/** Tarifa ARL Nivel I según Decreto 1607: 0.522%. Usada cuando el plan
 * no incluye ARL y corresponde emitir 1 día para ING/RET. */
const TARIFA_ARL_NIVEL_I = 0.522;

// ============ Encabezado (registro tipo 01) ============

export function construirEncabezado(
  planilla: PlanillaConDatos,
  totalEmpleados: number,
  totalNomina: number,
): string {
  let razonSocial: string;
  let tipoDocAportante: string;
  let numeroDocAportante: string;
  let dvAportante: string;
  let codArl: string;

  if (planilla.tipoPlanilla === 'E' && planilla.empresa) {
    razonSocial = planilla.empresa.nombre;
    tipoDocAportante = 'NI';
    numeroDocAportante = planilla.empresa.nit ?? '';
    dvAportante = planilla.empresa.dv ?? '0';
    codArl = planilla.empresa.arl?.codigoMinSalud ?? planilla.empresa.arl?.codigo ?? '';
  } else if (planilla.cotizante) {
    const c = planilla.cotizante;
    razonSocial = [c.primerNombre, c.segundoNombre, c.primerApellido, c.segundoApellido]
      .filter(Boolean)
      .join(' ');
    tipoDocAportante = tipoDocAportantePila(c.tipoDocumento);
    numeroDocAportante = c.numeroDocumento;
    dvAportante = calcularDV(c.numeroDocumento) ?? '0';
    const primeraLiq = planilla.comprobantes[0]?.comprobante.liquidaciones[0]?.liquidacion;
    codArl = primeraLiq?.afiliacion.arl?.codigoMinSalud ?? primeraLiq?.afiliacion.arl?.codigo ?? '';
  } else {
    throw new Error(`Planilla ${planilla.consecutivo} sin aportante (empresa o cotizante)`);
  }

  // Forma presentación: E/K → "S" (sucursal) · I → "U" (pago único)
  const formaPresentacion =
    planilla.tipoPlanilla === 'E' || planilla.tipoPlanilla === 'K' ? 'S' : 'U';

  let codSucursal = '';
  let nombreSucursal = '';
  if (formaPresentacion === 'S') {
    // Prioridad de búsqueda de sucursal:
    //   1. planilla.sucursal       → fuente de verdad multi-tenant
    //   2. createdBy.sucursal      → sucursal del usuario que generó
    //   3. cuentaCobro.sucursal    → fallback desde comprobantes
    const planillaSucursal = planilla.sucursal;
    if (planillaSucursal) {
      codSucursal = planillaSucursal.codigo;
      nombreSucursal = planillaSucursal.nombre;
    } else {
      const userSucursal = planilla.createdBy?.sucursal;
      if (userSucursal) {
        codSucursal = userSucursal.codigo;
        nombreSucursal = userSucursal.nombre;
      } else {
        for (const cp of planilla.comprobantes) {
          const s = cp.comprobante.cuentaCobro?.sucursal;
          if (s) {
            codSucursal = s.codigo;
            nombreSucursal = s.nombre;
            break;
          }
        }
      }
    }
  }

  const periodoOtros = padPeriodo(planilla.periodoAporteAnio, planilla.periodoAporteMes);
  const { anio: saludAnio, mes: saludMes } =
    planilla.tipoPlanilla === 'E' || planilla.tipoPlanilla === 'A' || planilla.tipoPlanilla === 'Y'
      ? shiftMes(planilla.periodoAporteAnio, planilla.periodoAporteMes, 1)
      : { anio: planilla.periodoAporteAnio, mes: planilla.periodoAporteMes };
  const periodoSalud = padPeriodo(saludAnio, saludMes);

  // Tipo aportante: E → "01" (empleador), I/K → "02" (independiente /
  // persona natural). En resolución el E también es persona natural pero
  // el formato del operador suele pedir "01" igualmente porque hay tipo
  // doc PA y eso lo identifica como especial.
  const tipoAportante = planilla.tipoPlanilla === 'E' ? '01' : '02';

  const parts: string[] = [];
  parts.push('01'); // 1 · Tipo registro
  parts.push('1'); // 2 · Modalidad
  parts.push(padNum(1, 4)); // 3 · Secuencia
  parts.push(padAlpha(razonSocial, 200)); // 4
  parts.push(padAlpha(tipoDocAportante, 2)); // 5
  parts.push(padAlpha(numeroDocAportante, 16)); // 6
  parts.push(padNum(Number(dvAportante) || 0, 1)); // 7
  parts.push(padAlpha(planilla.tipoPlanilla, 1)); // 8
  parts.push(blank(10)); // 9
  parts.push(blank(10)); // 10
  parts.push(formaPresentacion); // 11
  parts.push(padAlpha(codSucursal, 10)); // 12
  parts.push(padAlpha(nombreSucursal, 40)); // 13
  parts.push(padAlpha(codArl, 6)); // 14
  parts.push(periodoOtros); // 15
  parts.push(periodoSalud); // 16
  parts.push(padNum(0, 10)); // 17
  parts.push(blank(10)); // 18
  parts.push(padNum(totalEmpleados, 5)); // 19
  parts.push(padMoney(totalNomina, 12)); // 20
  parts.push(tipoAportante); // 21
  parts.push('00'); // 22

  return assertLength(parts.join(''), ENCABEZADO_LEN, 'encabezado');
}

// ============ Línea cotizante (registro tipo 02) ============

export type DatosCotizante = {
  secuencia: number;

  // Identificación
  tipoDoc: string;
  numeroDoc: string;
  primerNombre: string;
  segundoNombre: string | null;
  primerApellido: string;
  segundoApellido: string | null;
  codDepto: string;
  codMuni: string;

  // Tipo cotizante desde catálogo
  tipoCotizanteCodigo: string;
  subtipoCodigo: string;

  // Afiliación
  modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
  regimen: Regimen | null;
  nivelRiesgo: 'I' | 'II' | 'III' | 'IV' | 'V' | null;
  empresaExonera: boolean;
  fechaIngreso: Date;
  fechaRetiro: Date | null;
  planIncluyeEps: boolean;
  planIncluyeAfp: boolean;
  planIncluyeArl: boolean;
  planIncluyeCcf: boolean;

  // Entidades
  codAfp: string;
  codEps: string;
  codArl: string;
  codCcf: string;

  // Liquidación
  diasCotizados: number;
  salario: number;
  tipoLiquidacion: 'VINCULACION' | 'MENSUALIDAD';
  esPrimeraMensualidad: boolean;

  // Novedades del comprobante
  aplicaRetiroComp: boolean;

  // Tarifas y valores por subsistema
  tarifaPension: number;
  tarifaSalud: number;
  tarifaArl: number;
  tarifaCcf: number;
  tarifaSena: number;
  tarifaIcbf: number;
  valorPension: number;
  valorSalud: number;
  valorArl: number;
  valorCcf: number;
  valorSena: number;
  valorIcbf: number;
  valorFsp: number;
  valorSubsistencia: number;

  actividadEconomicaCodigo: string;
  smlv: number;
  tipoPlanilla: TipoPlanilla;

  // Split ARL: cuando esta línea es la 2ª (resto del mes sin ARL) se
  // marca campo 25 IGE con X y se omiten los valores ARL.
  campo25Ige: boolean;
  // Sobrescribe el flag de ING (para que la 2ª línea del split no lo
  // muestre aunque el cotizante tenga ING). Default: null → se aplica
  // la regla estándar.
  ingOverride: boolean | null;
  retOverride: boolean | null;
};

export function construirCotizante(d: DatosCotizante): string {
  // Banderas + overrides según tipo de planilla y régimen
  const banderas = banderasSubsistemas({
    tipoPlanilla: d.tipoPlanilla,
    regimen: d.regimen,
  });
  const overrides = identificacionForzada({
    tipoPlanilla: d.tipoPlanilla,
    regimen: d.regimen,
  });

  // Tipo doc, tipo cotizante y subtipo (posible override por política)
  const tipoDoc = overrides.tipoDocOverride ?? d.tipoDoc;
  const tipoCot = overrides.tipoCotizanteOverride ?? d.tipoCotizanteCodigo;
  const subtipo = overrides.subtipoOverride ?? d.subtipoCodigo;

  // Omisión de pensión por subtipo (solo aplica en tipos E/I ordinarios)
  const omisionPension = d.regimen !== 'RESOLUCION' && aplicaOmisionPension(d.subtipoCodigo);

  // IBC prorrateado por días.
  // Regla del operador PILA: salario/30 × días, redondeo HACIA ARRIBA
  // si el resultado tiene parte decimal (ej. 1575814.5 → 1575815).
  const ibcDia = d.salario / 30;
  const ibcBase = Math.ceil(ibcDia * d.diasCotizados);

  // Fallback para el día de salario exacto cuando días=0 (split línea 2
  // con 0 días ARL pero el resto queda en 0 lógicamente): sigue usando
  // base 30. Para líneas con días > 0 funciona normal.

  // Novedades ING/RET. Si vienen overrides (split), respetarlos.
  const aplicaIngreso =
    d.ingOverride ?? (d.tipoLiquidacion === 'MENSUALIDAD' && d.esPrimeraMensualidad);
  const aplicaRetiro = d.retOverride ?? d.aplicaRetiroComp;
  const ing = aplicaIngreso ? 'X' : ' ';
  const ret = aplicaRetiro ? 'X' : ' ';

  // Exoneración Ley 1607
  const exonera = exoneraLey1607Pila({
    modalidad: d.modalidad,
    empresaExonera: d.empresaExonera,
    ibcSalud: ibcBase,
    smlv: d.smlv,
  });

  // ---- Resolver valores efectivos por subsistema ----

  // Pensión: cero si no aplica al plano, si omisionPension, o si plan no
  // incluye AFP (resolución)
  const pensionActiva = banderas.aplicaAfp && !omisionPension;
  const codAfpEf = pensionActiva ? d.codAfp : '';
  const diasPension = pensionActiva ? d.diasCotizados : 0;
  const ibcPension = pensionActiva ? ibcBase : 0;
  const tarifaPensionEf = pensionActiva ? d.tarifaPension : 0;
  const valorPensionEf = pensionActiva ? d.valorPension : 0;
  const valorFspEf = pensionActiva ? d.valorFsp : 0;
  const valorSubsistenciaEf = pensionActiva ? d.valorSubsistencia : 0;

  // Salud
  const saludActiva = banderas.aplicaEps;
  const codEpsEf = saludActiva ? d.codEps : '';
  const diasSalud = saludActiva ? d.diasCotizados : 0;
  const ibcSalud = saludActiva ? ibcBase : 0;
  const tarifaSaludEf = saludActiva ? d.tarifaSalud : 0;
  const valorSaludEf = saludActiva ? d.valorSalud : 0;

  // ARL
  const arlActiva = banderas.aplicaArl;
  const codArlEf = arlActiva ? d.codArl : '';
  const diasArl = arlActiva ? d.diasCotizados : 0;
  const ibcArl = arlActiva ? ibcBase : 0;
  const tarifaArlEf = arlActiva ? d.tarifaArl : 0;
  const valorArlEf = arlActiva ? d.valorArl : 0;

  // CCF
  const ccfActiva = banderas.aplicaCcf;
  const codCcfEf = ccfActiva ? d.codCcf : '';
  const diasCcf = ccfActiva ? d.diasCotizados : 0;
  // IBC CCF: si plan sin CCF → $1 simbólico (regla de negocio)
  const ibcCcf = ccfActiva ? (d.planIncluyeCcf ? ibcBase : 1) : 0;
  // Tarifa CCF: el operador PILA exige 4% siempre que el campo CCF
  // esté activo (sea cobertura real o el mínimo legal de $1). Si la
  // liquidación no trae tarifa porque el plan no incluye CCF, la
  // defaulteamos a 4 (= 4%).
  const tarifaCcfEf = ccfActiva ? (d.planIncluyeCcf ? d.tarifaCcf || 4 : 4) : 0;
  const valorCcfEf = ccfActiva ? d.valorCcf : 0;

  // SENA e ICBF: 0 si plan K o E-resolución; 0 además si exonera Ley 1607
  const parafiscalesActivos = banderas.aplicaSenaIcbf && exonera !== 'S';
  const tarifaSenaEf = parafiscalesActivos ? d.tarifaSena : 0;
  const valorSenaEf = parafiscalesActivos ? d.valorSena : 0;
  const tarifaIcbfEf = parafiscalesActivos ? d.tarifaIcbf : 0;
  const valorIcbfEf = parafiscalesActivos ? d.valorIcbf : 0;

  // Total cotización pensión (47+48+49)
  const totalPension = valorPensionEf;

  // Salario integral: "F" para E, blanco para I/K
  const salarioIntegral = d.tipoPlanilla === 'E' ? 'F' : ' ';

  // Horas laboradas = días × 8
  const horas = d.diasCotizados * 8;

  // ---- Construcción de la línea ----
  const parts: string[] = [];
  parts.push('02'); // 1
  parts.push(padNum(d.secuencia, 5)); // 2
  parts.push(padAlpha(tipoDoc, 2)); // 3
  parts.push(padAlpha(d.numeroDoc, 16)); // 4
  parts.push(padAlpha(tipoCot, 2)); // 5
  parts.push(padAlpha(subtipo, 2)); // 6
  parts.push(' '); // 7
  parts.push(' '); // 8
  parts.push(padAlpha(d.codDepto, 2)); // 9
  parts.push(padAlpha(d.codMuni, 3)); // 10
  parts.push(padAlpha(d.primerApellido, 20)); // 11
  parts.push(padAlpha(d.segundoApellido, 30)); // 12
  parts.push(padAlpha(d.primerNombre, 20)); // 13
  parts.push(padAlpha(d.segundoNombre, 30)); // 14
  parts.push(ing); // 15 · ING
  parts.push(ret); // 16 · RET
  parts.push(' '); // 17 · TDE
  parts.push(' '); // 18 · TAE
  parts.push(' '); // 19 · TDP
  parts.push(' '); // 20 · TAP
  parts.push(' '); // 21 · VSP
  parts.push(' '); // 22 · Correcciones
  parts.push(' '); // 23 · VST
  parts.push(' '); // 24 · SLN
  parts.push(d.campo25Ige ? 'X' : ' '); // 25 · IGE (marcado en split línea 2)
  parts.push(' '); // 26 · LMA
  parts.push(' '); // 27 · VAC-LR
  parts.push(' '); // 28 · AVP
  parts.push(' '); // 29 · VCT
  parts.push(padNum(0, 2)); // 30
  parts.push(padAlpha(codAfpEf, 6)); // 31
  parts.push(blank(6)); // 32
  parts.push(padAlpha(codEpsEf, 6)); // 33
  parts.push(blank(6)); // 34
  parts.push(padAlpha(codCcfEf, 6)); // 35
  parts.push(padNum(diasPension, 2)); // 36
  parts.push(padNum(diasSalud, 2)); // 37
  parts.push(padNum(diasArl, 2)); // 38
  parts.push(padNum(diasCcf, 2)); // 39
  parts.push(padMoney(d.salario, 9)); // 40
  parts.push(salarioIntegral); // 41
  parts.push(padMoney(ibcPension, 9)); // 42
  parts.push(padMoney(ibcSalud, 9)); // 43
  parts.push(padMoney(ibcArl, 9)); // 44
  parts.push(padMoney(ibcCcf, 9)); // 45
  parts.push(padTarifa(tarifaPensionEf, 7)); // 46
  parts.push(padMoney(valorPensionEf, 9)); // 47
  parts.push(padMoney(0, 9)); // 48
  parts.push(padMoney(0, 9)); // 49
  parts.push(padMoney(totalPension, 9)); // 50
  parts.push(padMoney(valorFspEf, 9)); // 51
  parts.push(padMoney(valorSubsistenciaEf, 9)); // 52
  parts.push(padMoney(0, 9)); // 53
  parts.push(padTarifa(tarifaSaludEf, 7)); // 54
  parts.push(padMoney(valorSaludEf, 9)); // 55
  parts.push(padMoney(0, 9)); // 56
  parts.push(blank(15)); // 57
  parts.push(padMoney(0, 9)); // 58
  parts.push(blank(15)); // 59
  parts.push(padMoney(0, 9)); // 60
  parts.push(padTarifa(tarifaArlEf, 9)); // 61
  // 62 · Centro de trabajo — campo NUMÉRICO de 9 dígitos, ceros a la
  // izquierda. Default = "000000000" si no hay actividad económica.
  parts.push(padNum(Number(d.actividadEconomicaCodigo) || 0, 9)); // 62
  parts.push(padMoney(valorArlEf, 9)); // 63
  parts.push(padTarifa(tarifaCcfEf, 7)); // 64
  parts.push(padMoney(valorCcfEf, 9)); // 65
  parts.push(padTarifa(tarifaSenaEf, 7)); // 66
  parts.push(padMoney(valorSenaEf, 9)); // 67
  parts.push(padTarifa(tarifaIcbfEf, 7)); // 68
  parts.push(padMoney(valorIcbfEf, 9)); // 69
  parts.push(padTarifa(0, 7)); // 70
  parts.push(padMoney(0, 9)); // 71
  parts.push(padTarifa(0, 7)); // 72
  parts.push(padMoney(0, 9)); // 73
  parts.push(blank(2)); // 74
  parts.push(blank(16)); // 75
  parts.push(saludActiva ? exonera : 'N'); // 76 · Solo aplica en planos con EPS
  parts.push(padAlpha(codArlEf, 6)); // 77
  parts.push(claseRiesgoPila(arlActiva ? d.nivelRiesgo : null)); // 78
  parts.push(' '); // 79
  parts.push(aplicaIngreso ? padDate(d.fechaIngreso) : blank(10)); // 80
  parts.push(aplicaRetiro ? padDate(d.fechaRetiro) : blank(10)); // 81
  parts.push(blank(10)); // 82
  parts.push(blank(10)); // 83
  parts.push(blank(10)); // 84
  parts.push(blank(10)); // 85
  parts.push(blank(10)); // 86
  parts.push(blank(10)); // 87
  parts.push(blank(10)); // 88
  parts.push(blank(10)); // 89
  parts.push(blank(10)); // 90
  parts.push(blank(10)); // 91
  parts.push(blank(10)); // 92
  parts.push(blank(10)); // 93
  parts.push(blank(10)); // 94
  parts.push(padMoney(ibcSalud || ibcBase, 9)); // 95 · IBC otros parafiscales
  parts.push(padNum(horas, 3)); // 96

  // Padding operador (17): CIIU justificado a derecha, "0" si no hay
  const actividad = (d.actividadEconomicaCodigo || '0').trim() || '0';
  const padding = actividad.padStart(PADDING_OPERADOR_LEN, ' ').slice(-PADDING_OPERADOR_LEN);
  parts.push(padding);

  return assertLength(parts.join(''), LINEA_LEN, `cotizante #${d.secuencia}`);
}

// ============ Orquestador ============

export type GeneracionPlano = {
  contenido: string;
  totalCotizantes: number;
  totalNomina: number;
  filename: string;
};

/** Prorratea un valor monetario por proporción de días. */
function prorratearValor(valor: number, diasParte: number, diasTotal: number): number {
  if (diasTotal <= 0) return 0;
  return Math.trunc((valor * diasParte) / diasTotal);
}

export function generarPlano(
  planilla: PlanillaConDatos,
  cotizantesConMensualidadPrevia: Set<string> = new Set(),
): GeneracionPlano {
  const lineasCot: string[] = [];
  const cotizantesUnicos = new Set<string>();
  let totalNomina = 0;

  type Item = {
    cotizanteId: string;
    key: string;
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

      // Conceptos: se incluyen TODOS (reales e internos). Los CCF/ARL
      // internos son el mínimo legal que sí va al operador.
      const conceptos = liq.conceptos.map((x) => ({
        concepto: x.concepto,
        porcentaje: Number(x.porcentaje),
        valor: Number(x.valor),
      }));

      // Para cada subsistema, sumamos TODOS los conceptos de ese tipo
      // (real + interno si hay). En la práctica normalmente hay solo uno.
      const sumConcepto = (key: string) => {
        const matches = conceptos.filter((x) => x.concepto === key);
        if (matches.length === 0) return null;
        return {
          porcentaje: matches[0]!.porcentaje, // tarifa del primero
          valor: matches.reduce((s, m) => s + m.valor, 0),
        };
      };

      const eps = sumConcepto('EPS');
      const afp = sumConcepto('AFP');
      const arl = sumConcepto('ARL');
      const ccf = sumConcepto('CCF');
      const sena = sumConcepto('SENA');
      const icbf = sumConcepto('ICBF');
      const fsp = primero(conceptos, 'FSP');

      totalNomina += Number(liq.ibc);
      cotizantesUnicos.add(c.id);

      const esDep = af.modalidad === 'DEPENDIENTE';
      const empresa = af.empresa;

      // El TXT PILA espera el municipio en 3 dígitos (los últimos del
      // DIVIPOLA de 5). Helper para extraer.
      const tail3 = (cod: string | null | undefined): string => (cod ?? '').slice(-3);

      // ── Regla de negocio: Dependiente + Ordinario + plan SIN CCF ──
      // Por ley el aportante debe registrarse a la CCF de menor cobertura
      // del país (Comfamiliares Vichada). Así se fuerzan los campos
      // depto / muni / CCF a Vichada / Cumaribo / CCF68 en el TXT.
      // El cobro real de los $100 internos va dirigido a CCF68 también.
      const aplicaSinCcf = esDep && af.regimen === 'ORDINARIO' && af.planSgss?.incluyeCcf === false;

      const codDepto = aplicaSinCcf
        ? '99' // Vichada
        : esDep
          ? (empresa?.departamentoRef?.codigo ?? '')
          : (c.departamento?.codigo ?? '');
      const codMuni = aplicaSinCcf
        ? '773' // Cumaribo (DIVIPOLA 99773 → últimos 3)
        : esDep
          ? tail3(empresa?.municipioRef?.codigo)
          : tail3(c.municipio?.codigo);
      // Códigos PILA oficiales (codigoMinSalud) con fallback al interno.
      const codArl = esDep
        ? (empresa?.arl?.codigoMinSalud ??
          empresa?.arl?.codigo ??
          af.arl?.codigoMinSalud ??
          af.arl?.codigo ??
          '')
        : (af.arl?.codigoMinSalud ?? af.arl?.codigo ?? '');

      // CCF: si aplica la regla, forzar CCF68; si no, usar el de la
      // afiliación (con codigoMinSalud preferido sobre código interno).
      const codCcfFinal = aplicaSinCcf ? 'CCF68' : (af.ccf?.codigoMinSalud ?? af.ccf?.codigo ?? '');

      const actividadEconomica = af.actividadEconomica?.codigoCiiu ?? '0';
      const esPrimeraMensualidad = !cotizantesConMensualidadPrevia.has(c.id);

      // Base común para las líneas
      const baseDatos: Omit<
        DatosCotizante,
        | 'secuencia'
        | 'diasCotizados'
        | 'valorPension'
        | 'valorSalud'
        | 'valorArl'
        | 'valorCcf'
        | 'valorSena'
        | 'valorIcbf'
        | 'valorFsp'
        | 'valorSubsistencia'
        | 'campo25Ige'
        | 'ingOverride'
        | 'retOverride'
        | 'tarifaArl'
      > = {
        tipoDoc: tipoDocPila(c.tipoDocumento),
        numeroDoc: c.numeroDocumento,
        primerNombre: c.primerNombre,
        segundoNombre: c.segundoNombre,
        primerApellido: c.primerApellido,
        segundoApellido: c.segundoApellido,
        codDepto,
        codMuni,
        tipoCotizanteCodigo: af.tipoCotizante?.codigo ?? '01',
        subtipoCodigo: af.subtipo?.codigo ?? '00',
        modalidad: af.modalidad,
        regimen: af.regimen,
        nivelRiesgo: af.nivelRiesgo,
        empresaExonera: empresa?.exoneraLey1607 ?? false,
        fechaIngreso: new Date(af.fechaIngreso),
        fechaRetiro: af.fechaRetiro ? new Date(af.fechaRetiro) : null,
        planIncluyeEps: af.planSgss?.incluyeEps ?? true,
        planIncluyeAfp: af.planSgss?.incluyeAfp ?? true,
        planIncluyeArl: af.planSgss?.incluyeArl ?? true,
        planIncluyeCcf: af.planSgss?.incluyeCcf ?? true,
        codAfp: af.afp?.codigoMinSalud ?? af.afp?.codigo ?? '',
        codEps: af.eps?.codigoMinSalud ?? af.eps?.codigo ?? '',
        codArl,
        codCcf: codCcfFinal,
        salario: Number(af.salario),
        tipoLiquidacion: liq.tipo,
        esPrimeraMensualidad,
        aplicaRetiroComp,
        tarifaPension: afp?.porcentaje ?? 0,
        tarifaSalud: eps?.porcentaje ?? 0,
        tarifaCcf: ccf?.porcentaje ?? 0,
        tarifaSena: sena?.porcentaje ?? 0,
        tarifaIcbf: icbf?.porcentaje ?? 0,
        actividadEconomicaCodigo: actividadEconomica,
        smlv: Number(planilla.periodo.smlvSnapshot),
        tipoPlanilla: planilla.tipoPlanilla,
      };

      // ---- Detección de SPLIT ARL ----
      // Condiciones:
      //   - Planilla tipo E/I (no aplica a K, que solo tiene ARL)
      //   - Régimen ORDINARIO (resolución tiene sus propias reglas)
      //   - Plan NO incluye ARL
      //   - Hay novedad de Ingreso o Retiro
      //   - días cotizados ≥ 2
      const aplicaIngresoNorm = liq.tipo === 'MENSUALIDAD' && esPrimeraMensualidad;
      const aplicaRetiroNorm = aplicaRetiroComp;
      const tipoNoEsK = planilla.tipoPlanilla !== 'K';
      const esOrdinario = af.regimen !== 'RESOLUCION';
      const planSinArl = !(af.planSgss?.incluyeArl ?? true);
      const tieneNovedad = aplicaIngresoNorm || aplicaRetiroNorm;
      const splitAplica =
        tipoNoEsK && esOrdinario && planSinArl && tieneNovedad && liq.diasCotizados >= 2;

      if (splitAplica) {
        // ---- Línea 1: 1 día con ING/RET + ARL Nivel I ----
        const diasL1 = 1;
        const diasTotal = liq.diasCotizados;
        const diasL2 = diasTotal - diasL1;

        // Prorratear valores temporales (línea 1 = 1/N, línea 2 = (N-1)/N)
        // Garantiza suma exacta: L2 = total - L1
        const prorL1 = {
          pension: prorratearValor(afp?.valor ?? 0, diasL1, diasTotal),
          salud: prorratearValor(eps?.valor ?? 0, diasL1, diasTotal),
          ccf: prorratearValor(ccf?.valor ?? 0, diasL1, diasTotal),
          sena: prorratearValor(sena?.valor ?? 0, diasL1, diasTotal),
          icbf: prorratearValor(icbf?.valor ?? 0, diasL1, diasTotal),
          fsp: prorratearValor(fsp?.valor ?? 0, diasL1, diasTotal),
        };
        const prorL2 = {
          pension: (afp?.valor ?? 0) - prorL1.pension,
          salud: (eps?.valor ?? 0) - prorL1.salud,
          ccf: (ccf?.valor ?? 0) - prorL1.ccf,
          sena: (sena?.valor ?? 0) - prorL1.sena,
          icbf: (icbf?.valor ?? 0) - prorL1.icbf,
          fsp: (fsp?.valor ?? 0) - prorL1.fsp,
        };

        // Valor ARL línea 1: con tarifa Nivel I 1 día sobre IBC del día.
        // IBC de 1 día = salario/30 redondeado HACIA ARRIBA si hay decimal.
        const ibcDia1 = Math.ceil(Number(af.salario) / 30);
        const valorArlL1 = Math.ceil((ibcDia1 * (TARIFA_ARL_NIVEL_I / 100)) / 100) * 100; // redondeo round100Up

        const datos1: DatosCotizante = {
          ...baseDatos,
          secuencia: 0,
          diasCotizados: diasL1,
          tarifaArl: TARIFA_ARL_NIVEL_I,
          valorPension: prorL1.pension,
          valorSalud: prorL1.salud,
          valorArl: valorArlL1,
          valorCcf: prorL1.ccf,
          valorSena: prorL1.sena,
          valorIcbf: prorL1.icbf,
          valorFsp: prorL1.fsp,
          valorSubsistencia: 0,
          campo25Ige: false,
          ingOverride: aplicaIngresoNorm,
          retOverride: aplicaRetiroNorm,
        };

        const datos2: DatosCotizante = {
          ...baseDatos,
          secuencia: 0,
          diasCotizados: diasL2,
          tarifaArl: 0,
          valorPension: prorL2.pension,
          valorSalud: prorL2.salud,
          valorArl: 0, // sin ARL en línea 2
          valorCcf: prorL2.ccf,
          valorSena: prorL2.sena,
          valorIcbf: prorL2.icbf,
          valorFsp: prorL2.fsp,
          valorSubsistencia: 0,
          campo25Ige: true, // marca IGE
          ingOverride: false, // no repetir ING/RET en la 2ª línea
          retOverride: false,
        };

        items.push({
          cotizanteId: c.id,
          key: `${c.primerApellido}|${c.primerNombre}|${c.numeroDocumento}|1`,
          datos: datos1,
        });
        items.push({
          cotizanteId: c.id,
          key: `${c.primerApellido}|${c.primerNombre}|${c.numeroDocumento}|2`,
          datos: datos2,
        });
      } else {
        // ---- Línea única normal ----
        const datos: DatosCotizante = {
          ...baseDatos,
          secuencia: 0,
          diasCotizados: liq.diasCotizados,
          tarifaArl: arl?.porcentaje ?? 0,
          valorPension: afp?.valor ?? 0,
          valorSalud: eps?.valor ?? 0,
          valorArl: arl?.valor ?? 0,
          valorCcf: ccf?.valor ?? 0,
          valorSena: sena?.valor ?? 0,
          valorIcbf: icbf?.valor ?? 0,
          valorFsp: fsp?.valor ?? 0,
          valorSubsistencia: 0,
          campo25Ige: false,
          ingOverride: null,
          retOverride: null,
        };

        items.push({
          cotizanteId: c.id,
          key: `${c.primerApellido}|${c.primerNombre}|${c.numeroDocumento}|0`,
          datos,
        });
      }
    }
  }

  items.sort((a, b) => a.key.localeCompare(b.key));
  items.forEach((it, i) => {
    it.datos.secuencia = i + 1;
    lineasCot.push(construirCotizante(it.datos));
  });

  const encabezado = construirEncabezado(planilla, cotizantesUnicos.size, totalNomina);

  const contenido = [encabezado, ...lineasCot].join('\r\n') + '\r\n';

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
  const filename = `${planilla.consecutivo}_${planilla.tipoPlanilla}_${slug}_${periodo}.txt`;

  return {
    contenido,
    totalCotizantes: cotizantesUnicos.size,
    totalNomina,
    filename,
  };
}
