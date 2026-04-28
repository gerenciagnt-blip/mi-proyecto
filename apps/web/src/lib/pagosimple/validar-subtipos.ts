/**
 * Sprint Soporte reorg fase 2 — Validación de subtipos de cotizante.
 *
 * Caso de uso: dado un número de documento, queremos saber qué
 * subtipos de cotizante (PILA, dependiente) acepta el operador para
 * esta persona. Los subtipos típicamente asociados a OMISIÓN DE
 * PENSIÓN (pensionados, mayores a 50, etc.) son los que el operador
 * puede aceptar o rechazar dependiendo de los registros del cotizante
 * en BDUA/RUAF.
 *
 * Estrategia (3 planos en paralelo):
 *   1. Enviamos TRES planos sintéticos por separado a `POST /payroll/validate`:
 *        Plano A: subtipos 01-03-04-12
 *        Plano B: subtipo 05
 *        Plano C: subtipo 06
 *      La separación evita que UGPP cruce inconsistencias entre subtipos
 *      mutuamente excluyentes (ej: 05 vs 06).
 *   2. En todos los planos los campos relacionados con AFP/pensión van
 *      vacíos o en cero (omisión real de pensión).
 *   3. Para cada plano buscamos los mensajes UGPP que indican subtipo
 *      no permitido y marcamos el subtipo correspondiente.
 *   4. Consolidamos: subtipos válidos = los que ningún plano rechazó.
 *
 * NO persistimos el plano ni la respuesta. Es totalmente ephemeral —
 * solo informativo para el usuario en el form de afiliación.
 */

import {
  padNum,
  padAlpha,
  padMoney,
  padDate,
  padPeriodo,
  padTarifa,
  blank,
  assertLength,
} from '@/lib/planos/format';
import { ENCABEZADO_LEN, LINEA_LEN } from '@/lib/planos/generar';
import { calcularDV } from '@/lib/nit';
import { getFullAuthHeaders } from './auth';
import { requirePagosimpleConfig } from './config';
import { createLogger } from '@/lib/logger';
import type { PayrollValidateResponse, PayrollValidationDetailItem } from './types';

const log = createLogger('pagosimple:validar-subtipos');

/**
 * Grupos de subtipos a validar — cada grupo se envía como plano separado.
 * La separación es necesaria porque UGPP rechaza combinaciones de subtipos
 * mutuamente excluyentes en el mismo plano (ej: 05 y 06).
 */
export const GRUPOS_OMISION_PENSION: readonly (readonly string[])[] = [
  ['01', '03', '04', '12'],
  ['05'],
  ['06'],
] as const;

/** Subtipos de cotizante (PILA) candidatos a probar para omisión de pensión (flat). */
export const SUBTIPOS_OMISION_PENSION: readonly string[] = [
  '01',
  '03',
  '04',
  '05',
  '06',
  '12',
] as const;

// ============== Tipos ==============

export type EmpresaPlanoSintetico = {
  /** ID interno PagoSimple del aportante (para auth_token). */
  pagosimpleContributorId: string;
  /** NIT sin DV. */
  nit: string;
  /** DV (string '0'..'9'); se calcula si viene null. */
  dv: string | null;
  /** Razón social. */
  nombre: string;
  /** Código MinSalud o código local del ARL (6 chars). */
  codArl: string;
  /** Bandera Ley 1607. */
  exoneraLey1607: boolean;
};

export type SucursalPlanoSintetico = {
  codigo: string;
  nombre: string;
};

export type CotizantePlanoSintetico = {
  tipoDocumento: string; // 'CC' | 'CE' | 'TI' ...
  numeroDocumento: string;
  primerNombre: string;
  segundoNombre: string | null;
  primerApellido: string;
  segundoApellido: string | null;
  /** Códigos DIVIPOLA del cotizante (si están). Si no hay, se usan
   *  los de la empresa por fallback. */
  codDepto: string;
  codMuni: string;
  /** Códigos PILA de las administradoras a las que se "afilia" el
   *  cotizante en este plano sintético. Pueden venir de BDUA/RUAF o
   *  de defaults del sistema.
   *
   *  IMPORTANTE: el AFP NO se inserta en el plano (omisión de pensión —
   *  este campo se mantiene en la API por compat / claridad pero se
   *  ignora en la generación). */
  codEps: string;
  codAfp: string;
  codCcf: string;
};

export type ValidarSubtiposInput = {
  empresa: EmpresaPlanoSintetico;
  sucursal: SucursalPlanoSintetico;
  cotizante: CotizantePlanoSintetico;
  /** Subtipos a probar — si viene, se usa como UN solo plano; si no,
   *  se aplican los GRUPOS_OMISION_PENSION (3 planos). */
  subtipos?: readonly string[];
  /** Período YYYY-MM (default mes actual). */
  periodo?: { anio: number; mes: number };
  /** SMLV vigente para el plano (default 1.300.000). */
  smlv?: number;
};

export type ValidarSubtiposResult =
  | {
      ok: true;
      /** Subtipos PILA que el cotizante PUEDE usar (los que NO aparecen
       *  en ningún mensaje UGPP de subtipo no permitido). */
      validos: string[];
    }
  | { ok: false; error: string; code?: number };

/**
 * Regexes que detectan los mensajes UGPP que indican que un subtipo NO
 * está permitido para el cotizante. Conocidos:
 *
 *  A) "El cotizante no puede hacer uso del subtipo de cotizante 12.
 *      Puede dirigirse a los canales de atención dispuestos por la UGPP
 *      o al correo contactenos@ugpp.gov.co."
 *
 *  B) "Para el uso del subtipo de cotizante 1 el afiliado debe estar
 *      inscrito dentro del Reporte de Información de Personas Pensionadas..."
 *
 * Ambos extraen el número del subtipo en el grupo 1.
 */
const RE_SUBTIPO_NO_PERMITIDO_A = /no puede hacer uso del subtipo de cotizante\s+(\d+)/i;
const RE_SUBTIPO_NO_PERMITIDO_B = /Para el uso del subtipo de cotizante\s+(\d+)/i;

function extraerSubtipoNoPermitido(description: string): string | null {
  const a = RE_SUBTIPO_NO_PERMITIDO_A.exec(description);
  if (a && a[1]) return a[1].padStart(2, '0');
  const b = RE_SUBTIPO_NO_PERMITIDO_B.exec(description);
  if (b && b[1]) return b[1].padStart(2, '0');
  return null;
}

// ============== Constantes del plano sintético ==============

/** Tarifa salud estándar (12.5%). */
const TARIFA_SALUD = 12.5;
/** Tarifa CCF estándar (4%). */
const TARIFA_CCF = 4;
/** Tarifa SENA / ICBF (2% / 3%). Como exonera Ley 1607 con IBC<10 SMLV
 *  van a 0 — pero los dejamos por completitud. */
const TARIFA_SENA = 2;
const TARIFA_ICBF = 3;
/** Tarifa ARL Nivel I (mínimo). */
const TARIFA_ARL_NIVEL_I = 0.522;
/** Días cotizados estándar (mes completo). */
const DIAS_DEFAULT = 30;
/** Default SMLV — el operador acepta este valor para validación. */
const SMLV_DEFAULT = 1_300_000;

// ============== Builder del encabezado tipo E ==============

function construirEncabezadoSintetico(opts: {
  empresa: EmpresaPlanoSintetico;
  sucursal: SucursalPlanoSintetico;
  totalEmpleados: number;
  totalNomina: number;
  periodoOtros: { anio: number; mes: number };
  /** Periodo de salud — para tipo E es el mes siguiente al de aportes. */
  periodoSalud: { anio: number; mes: number };
}): string {
  const { empresa, sucursal, totalEmpleados, totalNomina, periodoOtros, periodoSalud } = opts;
  const dv = empresa.dv ?? calcularDV(empresa.nit) ?? '0';

  const parts: string[] = [];
  parts.push('01'); // 1 · Tipo registro encabezado
  parts.push('1'); // 2 · Modalidad
  parts.push(padNum(1, 4)); // 3 · Secuencia
  parts.push(padAlpha(empresa.nombre, 200)); // 4 · Razón social
  parts.push(padAlpha('NI', 2)); // 5 · Tipo doc aportante
  parts.push(padAlpha(empresa.nit, 16)); // 6 · NIT
  parts.push(padNum(Number(dv) || 0, 1)); // 7 · DV
  parts.push(padAlpha('E', 1)); // 8 · Tipo planilla
  parts.push(blank(10)); // 9
  parts.push(blank(10)); // 10
  parts.push('S'); // 11 · Forma presentación: Sucursal
  parts.push(padAlpha(sucursal.codigo, 10)); // 12 · Cód sucursal
  parts.push(padAlpha(sucursal.nombre, 40)); // 13 · Nombre sucursal
  parts.push(padAlpha(empresa.codArl, 6)); // 14 · Cód ARL
  parts.push(padPeriodo(periodoOtros.anio, periodoOtros.mes)); // 15
  parts.push(padPeriodo(periodoSalud.anio, periodoSalud.mes)); // 16
  parts.push(padNum(0, 10)); // 17
  parts.push(blank(10)); // 18
  parts.push(padNum(totalEmpleados, 5)); // 19
  parts.push(padMoney(totalNomina, 12)); // 20
  parts.push('01'); // 21 · Tipo aportante (E = empleador)
  parts.push('00'); // 22

  return assertLength(parts.join(''), ENCABEZADO_LEN, 'encabezado-validacion');
}

// ============== Builder de línea cotizante (sintética, dependiente E) ==============

function construirLineaSintetica(opts: {
  secuencia: number;
  empresa: EmpresaPlanoSintetico;
  cotizante: CotizantePlanoSintetico;
  subtipo: string;
  fechaIngreso: Date;
  salario: number;
  diasCotizados: number;
  smlv: number;
}): string {
  const { secuencia, empresa, cotizante, subtipo, fechaIngreso, salario, diasCotizados, smlv } =
    opts;

  // IBC = salario / 30 × días, redondeo HACIA ARRIBA.
  const ibcBase = Math.ceil((salario / 30) * diasCotizados);
  const horas = diasCotizados * 8;

  // Exoneración Ley 1607 — aplica si la empresa exonera Y el IBC < 10 SMLV.
  const exonera = empresa.exoneraLey1607 && ibcBase < 10 * smlv ? 'S' : 'N';

  // Valores por subsistema. PENSIÓN va totalmente en CERO porque estamos
  // probando OMISIÓN de pensión — la idea es ver qué subtipos acepta
  // UGPP sin reportar AFP.
  const valorSalud = exonera === 'S' ? 0 : Math.round(ibcBase * (TARIFA_SALUD / 100));
  const valorArl = Math.round(ibcBase * (TARIFA_ARL_NIVEL_I / 100));
  const valorCcf = Math.round(ibcBase * (TARIFA_CCF / 100));
  // SENA + ICBF: 0 si exonera (que es el caso default con 1 SMLV).
  const valorSena = exonera === 'S' ? 0 : Math.round(ibcBase * (TARIFA_SENA / 100));
  const valorIcbf = exonera === 'S' ? 0 : Math.round(ibcBase * (TARIFA_ICBF / 100));

  // Como es plano E "sintético" no aplica retiro; sí aplica ING (es un
  // ingreso ficticio para validar contra PagoSimple).
  const ing = 'X';
  const ret = ' ';

  const parts: string[] = [];
  parts.push('02'); // 1 · Tipo registro
  parts.push(padNum(secuencia, 5)); // 2 · Secuencia
  parts.push(padAlpha(cotizante.tipoDocumento, 2)); // 3
  parts.push(padAlpha(cotizante.numeroDocumento, 16)); // 4
  parts.push(padAlpha('01', 2)); // 5 · Tipo cotizante = Dependiente
  parts.push(padAlpha(subtipo, 2)); // 6 · Subtipo (varía por línea)
  parts.push(' '); // 7
  parts.push(' '); // 8
  parts.push(padAlpha(cotizante.codDepto, 2)); // 9
  parts.push(padAlpha(cotizante.codMuni, 3)); // 10
  parts.push(padAlpha(cotizante.primerApellido, 20)); // 11
  parts.push(padAlpha(cotizante.segundoApellido, 30)); // 12
  parts.push(padAlpha(cotizante.primerNombre, 20)); // 13
  parts.push(padAlpha(cotizante.segundoNombre, 30)); // 14
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
  parts.push(' '); // 25 · IGE
  parts.push(' '); // 26 · LMA
  parts.push(' '); // 27 · VAC-LR
  parts.push(' '); // 28 · AVP
  parts.push(' '); // 29 · VCT
  parts.push(padNum(0, 2)); // 30
  parts.push(blank(6)); // 31 · AFP — VACÍO para omisión de pensión
  parts.push(blank(6)); // 32
  parts.push(padAlpha(cotizante.codEps, 6)); // 33 · EPS
  parts.push(blank(6)); // 34
  parts.push(padAlpha(cotizante.codCcf, 6)); // 35 · CCF
  parts.push(padNum(0, 2)); // 36 · Días pensión = 0 (omisión)
  parts.push(padNum(diasCotizados, 2)); // 37 · Días salud
  parts.push(padNum(diasCotizados, 2)); // 38 · Días ARL
  parts.push(padNum(diasCotizados, 2)); // 39 · Días CCF
  parts.push(padMoney(salario, 9)); // 40 · Salario base
  parts.push('F'); // 41 · Salario integral (F = no integral)
  parts.push(padMoney(0, 9)); // 42 · IBC pensión = 0 (omisión)
  parts.push(padMoney(ibcBase, 9)); // 43 · IBC salud
  parts.push(padMoney(ibcBase, 9)); // 44 · IBC ARL
  parts.push(padMoney(ibcBase, 9)); // 45 · IBC CCF
  parts.push(padTarifa(0, 7)); // 46 · Tarifa pensión = 0
  parts.push(padMoney(0, 9)); // 47 · Cotización pensión = 0
  parts.push(padMoney(0, 9)); // 48
  parts.push(padMoney(0, 9)); // 49
  parts.push(padMoney(0, 9)); // 50 · Total cotización pensión = 0
  parts.push(padMoney(0, 9)); // 51 · FSP
  parts.push(padMoney(0, 9)); // 52 · Subsistencia
  parts.push(padMoney(0, 9)); // 53
  parts.push(padTarifa(TARIFA_SALUD, 7)); // 54
  parts.push(padMoney(valorSalud, 9)); // 55
  parts.push(padMoney(0, 9)); // 56
  parts.push(blank(15)); // 57
  parts.push(padMoney(0, 9)); // 58
  parts.push(blank(15)); // 59
  parts.push(padMoney(0, 9)); // 60
  parts.push(padTarifa(TARIFA_ARL_NIVEL_I, 9)); // 61
  parts.push(padNum(0, 9)); // 62 · Centro de trabajo
  parts.push(padMoney(valorArl, 9)); // 63
  parts.push(padTarifa(TARIFA_CCF, 7)); // 64
  parts.push(padMoney(valorCcf, 9)); // 65
  parts.push(padTarifa(exonera === 'S' ? 0 : TARIFA_SENA, 7)); // 66
  parts.push(padMoney(valorSena, 9)); // 67
  parts.push(padTarifa(exonera === 'S' ? 0 : TARIFA_ICBF, 7)); // 68
  parts.push(padMoney(valorIcbf, 9)); // 69
  parts.push(padTarifa(0, 7)); // 70
  parts.push(padMoney(0, 9)); // 71
  parts.push(padTarifa(0, 7)); // 72
  parts.push(padMoney(0, 9)); // 73
  parts.push(blank(2)); // 74
  parts.push(blank(16)); // 75
  parts.push(exonera); // 76 · Exoneración Ley 1607
  parts.push(padAlpha(empresa.codArl, 6)); // 77 · ARL
  parts.push('1'); // 78 · Clase de riesgo (Nivel I)
  parts.push(' '); // 79
  parts.push(padDate(fechaIngreso)); // 80 · Fecha ingreso
  parts.push(blank(10)); // 81 · Fecha retiro
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
  parts.push(padMoney(ibcBase, 9)); // 95 · IBC otros parafiscales
  parts.push(padNum(horas, 3)); // 96 · Horas

  // Padding operador (17 bytes): CIIU justificado a derecha, default '0'.
  parts.push('0'.padStart(17, ' '));

  return assertLength(parts.join(''), LINEA_LEN, `cotizante-#${secuencia}`);
}

// ============== Builder del plano completo ==============

export function generarPlanoValidacionSubtipos(input: ValidarSubtiposInput): {
  contenido: string;
  filename: string;
} {
  const subtipos = input.subtipos ?? SUBTIPOS_OMISION_PENSION;
  const now = new Date();
  const periodo = input.periodo ?? {
    anio: now.getUTCFullYear(),
    mes: now.getUTCMonth() + 1,
  };
  // Salud para plano E = mes siguiente al periodo de aportes.
  const periodoSalud =
    periodo.mes === 12
      ? { anio: periodo.anio + 1, mes: 1 }
      : { anio: periodo.anio, mes: periodo.mes + 1 };
  const smlv = input.smlv ?? SMLV_DEFAULT;
  const fechaIngreso = new Date(Date.UTC(periodo.anio, periodo.mes - 1, 1));

  const totalNomina = smlv * subtipos.length;

  const encabezado = construirEncabezadoSintetico({
    empresa: input.empresa,
    sucursal: input.sucursal,
    totalEmpleados: subtipos.length,
    totalNomina,
    periodoOtros: periodo,
    periodoSalud,
  });

  const lineas = subtipos.map((subtipo, idx) =>
    construirLineaSintetica({
      secuencia: idx + 1,
      empresa: input.empresa,
      cotizante: input.cotizante,
      subtipo,
      fechaIngreso,
      salario: smlv,
      diasCotizados: DIAS_DEFAULT,
      smlv,
    }),
  );

  const contenido = [encabezado, ...lineas].join('\r\n') + '\r\n';
  const stamp = `${periodo.anio}${String(periodo.mes).padStart(2, '0')}`;
  const subtipoTag = subtipos.join('-');
  const filename = `validacion-subtipos-${input.cotizante.numeroDocumento}-${subtipoTag}-${stamp}.txt`;

  return { contenido, filename };
}

// ============== Llamada a PagoSimple + parse de respuesta ==============

type PlanoEnvioResult =
  | { ok: true; noPermitidos: Set<string> }
  | { ok: false; error: string; code?: number };

/**
 * Envía UN plano sintético (con uno o varios subtipos) a PagoSimple y
 * extrae los subtipos no permitidos según los regex UGPP.
 */
async function enviarPlanoYExtraerNoPermitidos(args: {
  input: ValidarSubtiposInput;
  subtipos: readonly string[];
  headers: Record<string, string>;
  baseUrl: string;
}): Promise<PlanoEnvioResult> {
  const { input, subtipos, headers, baseUrl } = args;

  let plano: { contenido: string; filename: string };
  try {
    plano = generarPlanoValidacionSubtipos({ ...input, subtipos });
  } catch (e) {
    return {
      ok: false,
      error: `Error generando plano sintético: ${e instanceof Error ? e.message : 'desconocido'}`,
    };
  }

  const url = `${baseUrl}/payroll/validate`;
  const fd = new FormData();
  fd.append(
    'payroll_file',
    new Blob([new Uint8Array(Buffer.from(plano.contenido, 'utf-8'))], {
      type: 'text/plain',
    }),
    plano.filename,
  );
  fd.append(
    'execution_params',
    JSON.stringify({
      is_UGPP: false,
      is_novelties_planillaN: false,
      file_type: 'I', // El request siempre es I; el plano interno es E.
    }),
  );

  let resp: Response;
  try {
    resp = await fetch(url, { method: 'POST', headers, body: fd });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error de red';
    return { ok: false, error: `Error de red llamando a PagoSimple: ${msg}` };
  }

  const raw = await resp.text();
  let json: {
    success?: boolean;
    code?: number;
    message?: string;
    description?: string;
    data?: PayrollValidateResponse;
  } | null;
  try {
    json = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: `Respuesta no-JSON HTTP ${resp.status}: ${raw.slice(0, 200)}`,
      code: resp.status,
    };
  }
  if (!json || typeof json.success !== 'boolean') {
    return {
      ok: false,
      error: `HTTP ${resp.status} formato inesperado: ${JSON.stringify(json).slice(0, 200)}`,
      code: resp.status,
    };
  }
  if (!json.success || !json.data) {
    log.warn(
      { code: json.code, msg: json.message, subtipos },
      '/payroll/validate respondió success=false',
    );
    return {
      ok: false,
      error: json.message ?? `PagoSimple respondió code=${json.code}`,
      code: json.code,
    };
  }

  const data = json.data;
  const first = data.payroll_validations?.[0];
  if (!first) {
    return { ok: false, error: 'PagoSimple no devolvió payroll_validations.' };
  }

  // Buscamos en TODOS los errores los mensajes UGPP de subtipo no
  // permitido. Cualquier otro error es ruido del plano sintético.
  const todosErrores: PayrollValidationDetailItem[] = [
    ...(first.detail_errors_contributor ?? []),
    ...(first.detail_errors_company ?? []),
    ...(first.detail_warnings ?? []),
  ];

  const noPermitidos = new Set<string>();
  for (const err of todosErrores) {
    const num = extraerSubtipoNoPermitido(err.description);
    if (num) noPermitidos.add(num);
  }

  return { ok: true, noPermitidos };
}

/**
 * Ejecuta la validación de subtipos contra PagoSimple usando 3 planos
 * separados (o 1 si el caller pasó `subtipos` explícitos).
 *
 *   - Si `input.subtipos` viene definido: se envía UN solo plano con
 *     esos subtipos (modo legacy/testing).
 *   - Si no viene: se envían los GRUPOS_OMISION_PENSION (3 planos) en
 *     paralelo y se consolidan los resultados.
 */
export async function validarSubtiposCotizanteEnPagosimple(
  input: ValidarSubtiposInput,
): Promise<ValidarSubtiposResult> {
  const cfg = requirePagosimpleConfig();

  // Auth UNA sola vez — los 3 planos comparten el auth_token.
  let headers: Awaited<ReturnType<typeof getFullAuthHeaders>>;
  try {
    headers = await getFullAuthHeaders({
      id: input.empresa.pagosimpleContributorId,
      documentType: 'NI',
      document: input.empresa.nit,
    });
  } catch (authErr) {
    const msg = authErr instanceof Error ? authErr.message : String(authErr);
    return { ok: false, error: `Auth PagoSimple falló: ${msg}` };
  }

  // Determinar grupos de subtipos a enviar.
  const grupos: readonly (readonly string[])[] = input.subtipos
    ? [input.subtipos]
    : GRUPOS_OMISION_PENSION;

  // Enviar todos los grupos en paralelo (comparten auth).
  const resultados = await Promise.all(
    grupos.map((subtipos) =>
      enviarPlanoYExtraerNoPermitidos({
        input,
        subtipos,
        headers,
        baseUrl: cfg.baseUrl,
      }),
    ),
  );

  // Si CUALQUIER plano falló de manera fatal (no solo subtipo rechazado),
  // devolvemos el primer error — la validación parcial sería confusa.
  for (const r of resultados) {
    if (!r.ok) return { ok: false, error: r.error, code: r.code };
  }

  // Unión de subtipos no permitidos a través de los planos.
  const subtiposNoPermitidos = new Set<string>();
  for (const r of resultados) {
    if (r.ok) {
      for (const s of r.noPermitidos) subtiposNoPermitidos.add(s);
    }
  }

  // Lista total de subtipos consultados (todos los grupos aplanados).
  const todosLosSubtipos = grupos.flatMap((g) => [...g]);
  const validos = todosLosSubtipos.filter((s) => !subtiposNoPermitidos.has(s));

  log.info(
    {
      gruposEnviados: grupos.length,
      total: todosLosSubtipos.length,
      validos: validos.length,
      noPermitidos: Array.from(subtiposNoPermitidos),
    },
    'validación de subtipos completada',
  );

  return { ok: true, validos };
}
