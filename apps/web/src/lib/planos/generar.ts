import type { Prisma, TipoPlanilla } from '@pila/db';
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
import {
  tipoDocPila,
  tipoDocAportantePila,
  claseRiesgoPila,
  exoneraLey1607Pila,
} from './codigos';

/**
 * Genera el archivo plano PILA según resolución 2388/2016:
 *   - 1 línea registro tipo 01 (encabezado, 359 bytes)
 *   - N líneas registro tipo 02 (cotizantes, 676 + 17 padding = 693 bytes)
 *
 * La función es pura. El caller (route handler) prepara los datos.
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
                            arl: { select: { codigo: true } };
                          };
                        };
                        tipoCotizante: { select: { codigo: true } };
                        subtipo: { select: { codigo: true } };
                        planSgss: { select: { incluyeCcf: true } };
                        actividadEconomica: { select: { codigoCiiu: true } };
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

// ============ Helpers internos ============

type ConceptosLiq = { concepto: string; porcentaje: number; valor: number }[];

function primero(
  conceptos: ConceptosLiq,
  concepto: string,
): { porcentaje: number; valor: number } | null {
  const c = conceptos.find((x) => x.concepto === concepto);
  return c ? { porcentaje: c.porcentaje, valor: c.valor } : null;
}

/** Prorratea un valor mensual por días cotizados sobre base 30. */
function prorratear(valor: number, diasCotizados: number): number {
  if (diasCotizados <= 0) return 0;
  if (diasCotizados >= 30) return valor;
  return (valor / 30) * diasCotizados;
}

// ============ Encabezado (registro tipo 01) ============

export function construirEncabezado(
  planilla: PlanillaConDatos,
  totalEmpleados: number,
  totalNomina: number,
): string {
  // Aportante: razón social, tipo doc, número, DV
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
    codArl = planilla.empresa.arl?.codigo ?? '';
  } else if (planilla.cotizante) {
    // Independiente: aportante es la persona natural. DV calculado en base
    // al número de documento (algoritmo DIAN).
    const c = planilla.cotizante;
    razonSocial = [c.primerNombre, c.segundoNombre, c.primerApellido, c.segundoApellido]
      .filter(Boolean)
      .join(' ');
    tipoDocAportante = tipoDocAportantePila(c.tipoDocumento);
    numeroDocAportante = c.numeroDocumento;
    dvAportante = calcularDV(c.numeroDocumento) ?? '0';
    // ARL del independiente: de la primera liquidación
    const primeraLiq = planilla.comprobantes[0]?.comprobante.liquidaciones[0]?.liquidacion;
    codArl = primeraLiq?.afiliacion.arl?.codigo ?? '';
  } else {
    throw new Error(
      `Planilla ${planilla.consecutivo} sin aportante (empresa o cotizante)`,
    );
  }

  // Forma de presentación:
  //   - Tipo E (empleados) → "S" (sucursal)
  //   - Tipo I (independientes) → "U" (pago único)
  const formaPresentacion = planilla.tipoPlanilla === 'E' ? 'S' : 'U';

  // Código y nombre de sucursal: solo para forma "S". Toma de la sucursal
  // del usuario (Dueño Aliado) que generó la planilla. Si el creador es
  // ADMIN (sin sucursal), busca en el primer comprobante → cuenta de
  // cobro → sucursal.
  let codSucursal = '';
  let nombreSucursal = '';
  if (formaPresentacion === 'S') {
    const userSucursal = planilla.createdBy?.sucursal;
    if (userSucursal) {
      codSucursal = userSucursal.codigo;
      nombreSucursal = userSucursal.nombre;
    } else {
      // Fallback: sucursal de la primera cuenta de cobro encontrada
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

  // Períodos: otros = periodoAporte; salud = otros+1 para E/A/Y, mismo para I/N
  const periodoOtros = padPeriodo(
    planilla.periodoAporteAnio,
    planilla.periodoAporteMes,
  );
  const { anio: saludAnio, mes: saludMes } =
    planilla.tipoPlanilla === 'E' ||
    planilla.tipoPlanilla === 'A' ||
    planilla.tipoPlanilla === 'Y'
      ? shiftMes(planilla.periodoAporteAnio, planilla.periodoAporteMes, 1)
      : { anio: planilla.periodoAporteAnio, mes: planilla.periodoAporteMes };
  const periodoSalud = padPeriodo(saludAnio, saludMes);

  // Tipo aportante: E → "01" (empleador), I → "02" (independiente)
  const tipoAportante = planilla.tipoPlanilla === 'E' ? '01' : '02';

  const parts: string[] = [];
  parts.push('01'); // 1 · Tipo registro
  parts.push('1'); // 2 · Modalidad (Electrónica)
  parts.push(padNum(1, 4)); // 3 · Secuencia
  parts.push(padAlpha(razonSocial, 200)); // 4 · Razón social
  parts.push(padAlpha(tipoDocAportante, 2)); // 5 · Tipo doc
  parts.push(padAlpha(numeroDocAportante, 16)); // 6 · Num doc
  parts.push(padNum(Number(dvAportante) || 0, 1)); // 7 · DV
  parts.push(padAlpha(planilla.tipoPlanilla, 1)); // 8 · Tipo planilla
  parts.push(blank(10)); // 9 · N° planilla asociada (solo para N)
  parts.push(blank(10)); // 10 · Fecha pago asociada (solo para N)
  parts.push(formaPresentacion); // 11 · Forma presentación
  parts.push(padAlpha(codSucursal, 10)); // 12 · Cód sucursal
  parts.push(padAlpha(nombreSucursal, 40)); // 13 · Nombre sucursal
  parts.push(padAlpha(codArl, 6)); // 14 · Cód ARL
  parts.push(periodoOtros); // 15 · Período otros
  parts.push(periodoSalud); // 16 · Período salud
  parts.push(padNum(0, 10)); // 17 · N° radicación (lo asigna operador)
  parts.push(blank(10)); // 18 · Fecha pago (lo asigna operador)
  parts.push(padNum(totalEmpleados, 5)); // 19 · Total empleados
  parts.push(padMoney(totalNomina, 12)); // 20 · Valor total nómina
  parts.push(tipoAportante); // 21 · Tipo aportante
  parts.push('00'); // 22 · Cód operador (lo rellena el operador)

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

  // Ubicación laboral (DIVIPOLA)
  codDepto: string;
  codMuni: string;

  // Tipo cotizante desde catálogo (resolución 2388 códigos 01-56)
  tipoCotizanteCodigo: string;
  subtipoCodigo: string;

  // Afiliación
  modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
  nivelRiesgo: 'I' | 'II' | 'III' | 'IV' | 'V' | null;
  empresaExonera: boolean;
  fechaIngreso: Date;
  fechaRetiro: Date | null;
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
  esPrimeraMensualidad: boolean; // calculado por el orquestador (query previo)

  // Novedades del comprobante
  aplicaRetiroComp: boolean;

  // Tarifas y valores por subsistema (tal como vienen en la BD: 12.5 = 12.5%)
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

  // Actividad económica (CIIU o código interno) para el padding operador
  actividadEconomicaCodigo: string;

  // Contexto
  smlv: number;
  tipoPlanilla: TipoPlanilla;
};

export function construirCotizante(d: DatosCotizante): string {
  // IBC prorrateado por días (campos 42-45)
  const ibcDia = d.salario / 30;
  const ibcBase = Math.trunc(ibcDia * d.diasCotizados); // entero sin centavos

  // IBC CCF: si el plan NO incluye CCF, el IBC va en 1 (valor simbólico
  // para cumplir el formato sin generar cotización real).
  const ibcCcf = d.planIncluyeCcf ? ibcBase : 1;

  // Ingreso: X solo si es primera MENSUALIDAD del cotizante (no aplica
  // a VINCULACION). Se calcula desde query previo.
  const aplicaIngreso =
    d.tipoLiquidacion === 'MENSUALIDAD' && d.esPrimeraMensualidad;
  const ing = aplicaIngreso ? 'X' : ' ';

  // Retiro: X solo si el comprobante tiene la novedad marcada
  const aplicaRetiro = d.aplicaRetiroComp;
  const ret = aplicaRetiro ? 'X' : ' ';

  // Exoneración Ley 1607 — basada en IBC salud (ibcBase)
  const exonera = exoneraLey1607Pila({
    modalidad: d.modalidad,
    empresaExonera: d.empresaExonera,
    ibcSalud: ibcBase,
    smlv: d.smlv,
  });

  // Si exonera: SENA e ICBF en 0 (patrón 76=S → 66/67/68/69 = 0)
  const tarifaSenaEfectiva = exonera === 'S' ? 0 : d.tarifaSena;
  const valorSenaEfectivo = exonera === 'S' ? 0 : d.valorSena;
  const tarifaIcbfEfectiva = exonera === 'S' ? 0 : d.tarifaIcbf;
  const valorIcbfEfectivo = exonera === 'S' ? 0 : d.valorIcbf;

  const totalPension = d.valorPension; // 47+48+49 (no hay voluntarios)

  // Salario integral: "F" para tipo E, blanco para tipo I
  const salarioIntegral = d.tipoPlanilla === 'E' ? 'F' : ' ';

  // Horas laboradas = días × 8 (factor día de 8 horas)
  const horas = d.diasCotizados * 8;

  const parts: string[] = [];
  parts.push('02'); // 1 · Tipo registro
  parts.push(padNum(d.secuencia, 5)); // 2 · Secuencia
  parts.push(padAlpha(d.tipoDoc, 2)); // 3 · Tipo doc
  parts.push(padAlpha(d.numeroDoc, 16)); // 4 · Num doc
  parts.push(padAlpha(d.tipoCotizanteCodigo, 2)); // 5 · Tipo cotizante (BD)
  parts.push(padAlpha(d.subtipoCodigo, 2)); // 6 · Subtipo (BD)
  parts.push(' '); // 7 · Extranjero no obligado
  parts.push(' '); // 8 · Colombiano exterior
  parts.push(padAlpha(d.codDepto, 2)); // 9 · Cód depto
  parts.push(padAlpha(d.codMuni, 3)); // 10 · Cód muni
  parts.push(padAlpha(d.primerApellido, 20)); // 11
  parts.push(padAlpha(d.segundoApellido, 30)); // 12
  parts.push(padAlpha(d.primerNombre, 20)); // 13
  parts.push(padAlpha(d.segundoNombre, 30)); // 14
  parts.push(ing); // 15 · ING (primera mensualidad)
  parts.push(ret); // 16 · RET
  parts.push(' '); // 17 · TDE
  parts.push(' '); // 18 · TAE
  parts.push(' '); // 19 · TDP
  parts.push(' '); // 20 · TAP
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
  parts.push(padMoney(d.salario, 9)); // 40 · Salario (exacto, trunc)
  parts.push(salarioIntegral); // 41 · Salario integral (F para E)
  parts.push(padMoney(ibcBase, 9)); // 42 · IBC pensión (proporcional)
  parts.push(padMoney(ibcBase, 9)); // 43 · IBC salud
  parts.push(padMoney(ibcBase, 9)); // 44 · IBC ARL
  parts.push(padMoney(ibcCcf, 9)); // 45 · IBC CCF (1 si plan sin CCF)
  parts.push(padTarifa(d.tarifaPension, 7)); // 46 · Tarifa pensión
  parts.push(padMoney(d.valorPension, 9)); // 47 · Cot oblig pensión
  parts.push(padMoney(0, 9)); // 48 · Aporte voluntario afiliado
  parts.push(padMoney(0, 9)); // 49 · Aporte voluntario aportante
  parts.push(padMoney(totalPension, 9)); // 50 · Total cot pensión
  parts.push(padMoney(d.valorFsp, 9)); // 51 · FSP solidaridad
  parts.push(padMoney(d.valorSubsistencia, 9)); // 52 · FSP subsistencia
  parts.push(padMoney(0, 9)); // 53 · Val no retenido
  parts.push(padTarifa(d.tarifaSalud, 7)); // 54 · Tarifa salud
  parts.push(padMoney(d.valorSalud, 9)); // 55 · Cot oblig salud
  parts.push(padMoney(0, 9)); // 56 · Valor UPC adicional
  parts.push(blank(15)); // 57 · N° aut incap
  parts.push(padMoney(0, 9)); // 58 · Val incap
  parts.push(blank(15)); // 59 · N° aut licencia
  parts.push(padMoney(0, 9)); // 60 · Val licencia
  parts.push(padTarifa(d.tarifaArl, 9)); // 61 · Tarifa ARL
  parts.push(padAlpha('0000000', 9)); // 62 · Centro trabajo
  parts.push(padMoney(d.valorArl, 9)); // 63 · Cot ARL
  parts.push(padTarifa(d.tarifaCcf, 7)); // 64 · Tarifa CCF
  parts.push(padMoney(d.valorCcf, 9)); // 65 · Val CCF
  parts.push(padTarifa(tarifaSenaEfectiva, 7)); // 66 · Tarifa SENA (0 si exonera)
  parts.push(padMoney(valorSenaEfectivo, 9)); // 67 · Val SENA (0 si exonera)
  parts.push(padTarifa(tarifaIcbfEfectiva, 7)); // 68 · Tarifa ICBF (0 si exonera)
  parts.push(padMoney(valorIcbfEfectivo, 9)); // 69 · Val ICBF (0 si exonera)
  parts.push(padTarifa(0, 7)); // 70 · Tarifa ESAP
  parts.push(padMoney(0, 9)); // 71 · Val ESAP
  parts.push(padTarifa(0, 7)); // 72 · Tarifa MEN
  parts.push(padMoney(0, 9)); // 73 · Val MEN
  parts.push(blank(2)); // 74 · Tipo doc cot principal
  parts.push(blank(16)); // 75 · Num doc cot principal
  parts.push(exonera); // 76 · Exonera Ley 1607
  parts.push(padAlpha(d.codArl, 6)); // 77 · Cód ARL
  parts.push(claseRiesgoPila(d.nivelRiesgo)); // 78 · Clase riesgo
  parts.push(' '); // 79 · Ind tarifa especial pensión
  parts.push(aplicaIngreso ? padDate(d.fechaIngreso) : blank(10)); // 80 · Fecha ingreso
  parts.push(aplicaRetiro ? padDate(d.fechaRetiro) : blank(10)); // 81 · Fecha retiro
  parts.push(blank(10)); // 82 · F inicio VSP
  parts.push(blank(10)); // 83 · F inicio SLN
  parts.push(blank(10)); // 84 · F fin SLN
  parts.push(blank(10)); // 85 · F inicio IGE
  parts.push(blank(10)); // 86 · F fin IGE
  parts.push(blank(10)); // 87 · F inicio LMA
  parts.push(blank(10)); // 88 · F fin LMA
  parts.push(blank(10)); // 89 · F inicio VAC-LR
  parts.push(blank(10)); // 90 · F fin VAC-LR
  parts.push(blank(10)); // 91 · F inicio VCT
  parts.push(blank(10)); // 92 · F fin VCT
  parts.push(blank(10)); // 93 · F inicio IRL
  parts.push(blank(10)); // 94 · F fin IRL
  parts.push(padMoney(ibcBase, 9)); // 95 · IBC otros parafiscales
  parts.push(padNum(horas, 3)); // 96 · N° horas laboradas (días × 8)

  // Padding operador (17 bytes): actividad económica justificada a la
  // derecha con espacios a la izquierda — así luce como el plano ejemplo.
  const actividad = d.actividadEconomicaCodigo.trim();
  const padding = actividad
    ? actividad.padStart(PADDING_OPERADOR_LEN, ' ').slice(-PADDING_OPERADOR_LEN)
    : blank(PADDING_OPERADOR_LEN);
  parts.push(padding);

  const linea = parts.join('');
  return assertLength(linea, LINEA_LEN, `cotizante #${d.secuencia}`);
}

// ============ Orquestador ============

export type GeneracionPlano = {
  contenido: string;
  totalCotizantes: number;
  totalNomina: number;
  filename: string;
};

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

      // Conceptos: excluimos los "internos" (no van al operador PILA)
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

      totalNomina += Number(liq.ibc);
      cotizantesUnicos.add(c.id);

      // Ubicación, ARL y actividad según modalidad
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

      // Actividad económica: preferir la de la afiliación; fallback a la
      // de la empresa (ciiuPrincipal) para dependientes.
      const actividadEconomica =
        af.actividadEconomica?.codigoCiiu ??
        (esDep ? empresa?.ciiuPrincipal ?? '' : '');

      const esPrimeraMensualidad = !cotizantesConMensualidadPrevia.has(c.id);

      const datos: DatosCotizante = {
        secuencia: 0,
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
        nivelRiesgo: af.nivelRiesgo,
        empresaExonera: empresa?.exoneraLey1607 ?? false,
        fechaIngreso: new Date(af.fechaIngreso),
        fechaRetiro: af.fechaRetiro ? new Date(af.fechaRetiro) : null,
        planIncluyeCcf: af.planSgss?.incluyeCcf ?? true,
        codAfp: af.afp?.codigo ?? '',
        codEps: af.eps?.codigo ?? '',
        codArl,
        codCcf: af.ccf?.codigo ?? '',
        diasCotizados: liq.diasCotizados,
        salario: Number(af.salario),
        tipoLiquidacion: liq.tipo,
        esPrimeraMensualidad,
        aplicaRetiroComp,
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
        actividadEconomicaCodigo: actividadEconomica,
        smlv: Number(planilla.periodo.smlvSnapshot),
        tipoPlanilla: planilla.tipoPlanilla,
      };

      items.push({
        cotizanteId: c.id,
        key: `${c.primerApellido}|${c.primerNombre}|${c.numeroDocumento}`,
        datos,
      });
    }
  }

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

  // Nombre del archivo
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
