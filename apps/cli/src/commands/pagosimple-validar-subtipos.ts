/**
 * Comando `pagosimple:validar-subtipos` — Test E2E de la validación de
 * subtipos de cotizante. Genera el plano sintético tipo E (6 líneas, una
 * por subtipo candidato), lo envía a PagoSimple `POST /payroll/validate`
 * e imprime el response completo + el plano generado para que el operador
 * pueda diagnosticar manualmente.
 *
 * Uso:
 *   pnpm cli pagosimple:validar-subtipos -- --doc 12345
 *   pnpm cli pagosimple:validar-subtipos -- --doc 12345 --tipo CE
 *
 * Flags:
 *   --doc <numero>   Número de documento del cotizante (obligatorio).
 *   --tipo <CC|CE|TI|RC|PAS|NIP>  Tipo de documento (default CC).
 *   --raw            Imprime el plano en texto plano además del JSON.
 *
 * Notas:
 *   - Replica la lógica de `validarSubtiposCotizanteAction` del web app
 *     pero en CLI auto-contenido (sin importar de apps/web). La generación
 *     del plano duplica las primitivas de `lib/planos/format.ts` por la
 *     misma razón.
 *   - Read-only: no toca BD ni PagoSimple en escritura.
 */

import { prisma } from '@pila/db';

// ============== Config ==============

type Config = {
  baseUrl: string;
  masterNit: string;
  masterDocumentType: string;
  masterDocument: string;
  masterPassword: string;
  masterCompany: string;
  masterSecretKey: string;
};

const REQUIRED_VARS = [
  'PAGOSIMPLE_BASE_URL',
  'PAGOSIMPLE_MASTER_NIT',
  'PAGOSIMPLE_MASTER_COMPANY',
  'PAGOSIMPLE_MASTER_SECRET_KEY',
  'PAGOSIMPLE_MASTER_DOCUMENT_TYPE',
  'PAGOSIMPLE_MASTER_DOCUMENT',
  'PAGOSIMPLE_MASTER_PASSWORD',
] as const;

function loadConfig(): Config | { missing: string[] } {
  const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
  if (missing.length > 0) return { missing };
  return {
    baseUrl: process.env.PAGOSIMPLE_BASE_URL!.replace(/\/+$/, ''),
    masterNit: process.env.PAGOSIMPLE_MASTER_NIT!,
    masterCompany: process.env.PAGOSIMPLE_MASTER_COMPANY!,
    masterSecretKey: process.env.PAGOSIMPLE_MASTER_SECRET_KEY!,
    masterDocumentType: process.env.PAGOSIMPLE_MASTER_DOCUMENT_TYPE!,
    masterDocument: process.env.PAGOSIMPLE_MASTER_DOCUMENT!,
    masterPassword: process.env.PAGOSIMPLE_MASTER_PASSWORD!,
  };
}

// ============== Subtipos ==============

const SUBTIPOS = ['01', '03', '04', '05', '06', '12'] as const;

// ============== Primitivas de formato PILA ==============

function padNum(value: number, length: number): string {
  const n = Math.trunc(value);
  const s = String(n < 0 ? 0 : n);
  if (s.length >= length) return s.slice(-length);
  return s.padStart(length, '0');
}
function normalizeText(s: string): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 \-.']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function padAlpha(value: string | null | undefined, length: number): string {
  const s = normalizeText(value ?? '');
  if (s.length >= length) return s.slice(0, length);
  return s.padEnd(length, ' ');
}
function blank(length: number): string {
  return ' '.repeat(length);
}
function padMoney(value: number, length: number): string {
  if (!Number.isFinite(value)) return '0'.repeat(length);
  return padNum(Math.max(0, Math.trunc(value)), length);
}
function padDate(date: Date | null): string {
  if (!date) return blank(10);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function padPeriodo(anio: number, mes: number): string {
  return `${String(anio).padStart(4, '0').slice(-4)}-${String(mes).padStart(2, '0')}`;
}
function padTarifa(percent: number, length = 7): string {
  const n = Number.isFinite(percent) && percent >= 0 ? percent : 0;
  const decimals = length - 2;
  return (n / 100).toFixed(decimals);
}

function calcularDV(nit: string): string {
  const digits = nit.replace(/\D/g, '');
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let suma = 0;
  for (let i = 0; i < digits.length; i++) {
    const peso = pesos[digits.length - 1 - i] ?? 0;
    const d = Number(digits[i]) || 0;
    suma += d * peso;
  }
  const resto = suma % 11;
  return String(resto === 0 || resto === 1 ? resto : 11 - resto);
}

// ============== HTTP a PagoSimple ==============

type LoginData = { token: string; session_token: string };
type AuthData = { auth_token: string };

async function pagosimplePost<T>(
  url: string,
  init: RequestInit,
): Promise<{ data: T; raw: string; status: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
  let resp: Response;
  try {
    resp = await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
  const raw = await resp.text();
  const json = JSON.parse(raw) as {
    success?: boolean;
    code?: number;
    message?: string;
    description?: string;
    data?: T;
  };
  if (json.success !== true) {
    throw new Error(
      `[${json.code}] ${json.message ?? 'success=false'} — ${json.description ?? ''}`,
    );
  }
  return { data: json.data as T, raw, status: resp.status };
}

async function login(cfg: Config): Promise<LoginData> {
  const { data } = await pagosimplePost<LoginData>(`${cfg.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_type: cfg.masterDocumentType,
      document: cfg.masterDocument,
      password: cfg.masterPassword,
      secret_key: cfg.masterSecretKey,
      nit: cfg.masterNit,
      company: cfg.masterCompany,
    }),
  });
  return data;
}

async function getAuthToken(
  cfg: Config,
  login: LoginData,
  id: string,
  documentType: string,
  document: string,
): Promise<string> {
  const url = `${cfg.baseUrl}/auth/${encodeURIComponent(id)}/${encodeURIComponent(documentType)}/${encodeURIComponent(document)}`;
  const { data } = await pagosimplePost<AuthData>(url, {
    method: 'GET',
    headers: {
      nit: cfg.masterNit,
      token: login.token,
      session_token: login.session_token,
    },
  });
  return data.auth_token;
}

// ============== Plano sintético ==============

const ENCABEZADO_LEN = 359;
const COTIZANTE_LEN = 676;
const PADDING_OPERADOR_LEN = 17;
const LINEA_LEN = COTIZANTE_LEN + PADDING_OPERADOR_LEN; // 693

const TARIFA_PENSION = 16;
const TARIFA_SALUD = 12.5;
const TARIFA_CCF = 4;
const TARIFA_SENA = 2;
const TARIFA_ICBF = 3;
const TARIFA_ARL_NIVEL_I = 0.522;
const DIAS = 30;
const SMLV = 1_300_000;

type EmpresaHost = {
  pagosimpleContributorId: string;
  nit: string;
  dv: string | null;
  nombre: string;
  codArl: string;
  exoneraLey1607: boolean;
};

type Cotizante = {
  tipoDocumento: string;
  numeroDocumento: string;
  primerNombre: string;
  segundoNombre: string | null;
  primerApellido: string;
  segundoApellido: string | null;
  codDepto: string;
  codMuni: string;
  codEps: string;
  codAfp: string;
  codCcf: string;
};

function construirEncabezado(opts: {
  empresa: EmpresaHost;
  sucursalCodigo: string;
  sucursalNombre: string;
  totalEmpleados: number;
  totalNomina: number;
  periodoOtros: { anio: number; mes: number };
  periodoSalud: { anio: number; mes: number };
}): string {
  const {
    empresa,
    sucursalCodigo,
    sucursalNombre,
    totalEmpleados,
    totalNomina,
    periodoOtros,
    periodoSalud,
  } = opts;
  const dv = empresa.dv ?? calcularDV(empresa.nit);
  const parts: string[] = [];
  parts.push('01');
  parts.push('1');
  parts.push(padNum(1, 4));
  parts.push(padAlpha(empresa.nombre, 200));
  parts.push(padAlpha('NI', 2));
  parts.push(padAlpha(empresa.nit, 16));
  parts.push(padNum(Number(dv) || 0, 1));
  parts.push(padAlpha('E', 1));
  parts.push(blank(10));
  parts.push(blank(10));
  parts.push('S');
  parts.push(padAlpha(sucursalCodigo, 10));
  parts.push(padAlpha(sucursalNombre, 40));
  parts.push(padAlpha(empresa.codArl, 6));
  parts.push(padPeriodo(periodoOtros.anio, periodoOtros.mes));
  parts.push(padPeriodo(periodoSalud.anio, periodoSalud.mes));
  parts.push(padNum(0, 10));
  parts.push(blank(10));
  parts.push(padNum(totalEmpleados, 5));
  parts.push(padMoney(totalNomina, 12));
  parts.push('01');
  parts.push('00');
  const s = parts.join('');
  if (s.length !== ENCABEZADO_LEN)
    throw new Error(`encabezado len ${s.length} ≠ ${ENCABEZADO_LEN}`);
  return s;
}

function construirLinea(opts: {
  secuencia: number;
  empresa: EmpresaHost;
  cotizante: Cotizante;
  subtipo: string;
  fechaIngreso: Date;
}): string {
  const { secuencia, empresa, cotizante, subtipo, fechaIngreso } = opts;
  const ibcBase = Math.ceil((SMLV / 30) * DIAS);
  const horas = DIAS * 8;
  const exonera = empresa.exoneraLey1607 && ibcBase < 10 * SMLV ? 'S' : 'N';
  const valorPension = Math.round(ibcBase * (TARIFA_PENSION / 100));
  const valorSalud = exonera === 'S' ? 0 : Math.round(ibcBase * (TARIFA_SALUD / 100));
  const valorArl = Math.round(ibcBase * (TARIFA_ARL_NIVEL_I / 100));
  const valorCcf = Math.round(ibcBase * (TARIFA_CCF / 100));
  const valorSena = exonera === 'S' ? 0 : Math.round(ibcBase * (TARIFA_SENA / 100));
  const valorIcbf = exonera === 'S' ? 0 : Math.round(ibcBase * (TARIFA_ICBF / 100));

  const parts: string[] = [];
  parts.push('02');
  parts.push(padNum(secuencia, 5));
  parts.push(padAlpha(cotizante.tipoDocumento, 2));
  parts.push(padAlpha(cotizante.numeroDocumento, 16));
  parts.push(padAlpha('01', 2));
  parts.push(padAlpha(subtipo, 2));
  parts.push(' ');
  parts.push(' ');
  parts.push(padAlpha(cotizante.codDepto, 2));
  parts.push(padAlpha(cotizante.codMuni, 3));
  parts.push(padAlpha(cotizante.primerApellido, 20));
  parts.push(padAlpha(cotizante.segundoApellido, 30));
  parts.push(padAlpha(cotizante.primerNombre, 20));
  parts.push(padAlpha(cotizante.segundoNombre, 30));
  parts.push('X'); // ING
  parts.push(' '); // RET
  for (let i = 0; i < 13; i++) parts.push(' '); // 17..29
  parts.push(padNum(0, 2));
  parts.push(padAlpha(cotizante.codAfp, 6));
  parts.push(blank(6));
  parts.push(padAlpha(cotizante.codEps, 6));
  parts.push(blank(6));
  parts.push(padAlpha(cotizante.codCcf, 6));
  parts.push(padNum(DIAS, 2));
  parts.push(padNum(DIAS, 2));
  parts.push(padNum(DIAS, 2));
  parts.push(padNum(DIAS, 2));
  parts.push(padMoney(SMLV, 9));
  parts.push('F');
  parts.push(padMoney(ibcBase, 9));
  parts.push(padMoney(ibcBase, 9));
  parts.push(padMoney(ibcBase, 9));
  parts.push(padMoney(ibcBase, 9));
  parts.push(padTarifa(TARIFA_PENSION, 7));
  parts.push(padMoney(valorPension, 9));
  parts.push(padMoney(0, 9));
  parts.push(padMoney(0, 9));
  parts.push(padMoney(valorPension, 9));
  parts.push(padMoney(0, 9));
  parts.push(padMoney(0, 9));
  parts.push(padMoney(0, 9));
  parts.push(padTarifa(TARIFA_SALUD, 7));
  parts.push(padMoney(valorSalud, 9));
  parts.push(padMoney(0, 9));
  parts.push(blank(15));
  parts.push(padMoney(0, 9));
  parts.push(blank(15));
  parts.push(padMoney(0, 9));
  parts.push(padTarifa(TARIFA_ARL_NIVEL_I, 9));
  parts.push(padNum(0, 9));
  parts.push(padMoney(valorArl, 9));
  parts.push(padTarifa(TARIFA_CCF, 7));
  parts.push(padMoney(valorCcf, 9));
  parts.push(padTarifa(exonera === 'S' ? 0 : TARIFA_SENA, 7));
  parts.push(padMoney(valorSena, 9));
  parts.push(padTarifa(exonera === 'S' ? 0 : TARIFA_ICBF, 7));
  parts.push(padMoney(valorIcbf, 9));
  parts.push(padTarifa(0, 7));
  parts.push(padMoney(0, 9));
  parts.push(padTarifa(0, 7));
  parts.push(padMoney(0, 9));
  parts.push(blank(2));
  parts.push(blank(16));
  parts.push(exonera);
  parts.push(padAlpha(empresa.codArl, 6));
  parts.push('1'); // clase riesgo I
  parts.push(' ');
  parts.push(padDate(fechaIngreso));
  for (let i = 0; i < 14; i++) parts.push(blank(10));
  parts.push(padMoney(ibcBase, 9));
  parts.push(padNum(horas, 3));
  parts.push('0'.padStart(PADDING_OPERADOR_LEN, ' '));

  const s = parts.join('');
  if (s.length !== LINEA_LEN) {
    throw new Error(`linea ${secuencia} len ${s.length} ≠ ${LINEA_LEN}`);
  }
  return s;
}

// ============== Resolución de inputs (lectura BD) ==============

async function resolverEmpresaHost() {
  return prisma.empresa.findFirst({
    where: {
      active: true,
      pagosimpleContributorId: { not: null },
      arl: { isNot: null },
    },
    include: {
      arl: { select: { codigo: true, codigoMinSalud: true } },
      departamentoRef: { select: { codigo: true } },
      municipioRef: { select: { codigo: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function resolverEntidadDefault(tipo: 'EPS' | 'AFP' | 'CCF') {
  const e = await prisma.entidadSgss.findFirst({
    where: { tipo, active: true },
    orderBy: { codigo: 'asc' },
    select: { codigo: true, codigoMinSalud: true, nombre: true },
  });
  return e
    ? { codigo: e.codigoMinSalud ?? e.codigo, nombre: e.nombre }
    : { codigo: '', nombre: '—' };
}

async function consultarBduaRuaf(
  cfg: Config,
  loginData: LoginData,
  documentType: string,
  document: string,
): Promise<{ epsCodMin: string; afpCodMin: string; isPensionary?: string } | null> {
  try {
    const { data } = await pagosimplePost<
      Array<{
        affiliate_type: string;
        bdua_eps_code?: string;
        ruaf_afp_code?: string;
        is_pensionary?: 'SI' | 'NO';
      }>
    >(`${cfg.baseUrl}/bdua-ruaf/data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        nit: cfg.masterNit,
        token: loginData.token,
      },
      body: JSON.stringify({ document_type: documentType, document }),
    });
    if (!Array.isArray(data) || data.length === 0) return null;
    const cot = data.find((i) => i.affiliate_type === 'C') ?? data[0]!;
    return {
      epsCodMin: (cot.bdua_eps_code ?? '').trim(),
      afpCodMin: (cot.ruaf_afp_code ?? '').trim(),
      isPensionary: cot.is_pensionary,
    };
  } catch {
    return null;
  }
}

// ============== Comando ==============

export async function pagosimpleValidarSubtiposCommand(options: {
  doc?: string;
  tipo?: string;
  raw?: boolean;
}): Promise<void> {
  const args = {
    tipo: (options.tipo ?? 'CC').toUpperCase(),
    doc: options.doc ?? '',
    raw: options.raw ?? false,
  };
  if (!args.doc) {
    console.error('❌ Falta --doc <numero>');
    console.error('Ejemplo: pnpm cli pagosimple:validar-subtipos -- --doc 12345 --tipo CC');
    process.exit(1);
  }

  console.log('\n🧪 PagoSimple · validar subtipos\n');
  console.log(`   Documento: ${args.tipo} ${args.doc}`);
  console.log(`   Subtipos:  ${SUBTIPOS.join(' · ')}`);

  const cfgOrErr = loadConfig();
  if ('missing' in cfgOrErr) {
    console.error('\n❌ Faltan vars en .env:');
    for (const v of cfgOrErr.missing) console.error(`   - ${v}`);
    process.exit(1);
  }
  const cfg = cfgOrErr;

  // 1) Login
  console.log('\n→ POST /auth/login');
  const t0 = Date.now();
  const loginData = await login(cfg).catch((e: Error) => {
    console.error(`   ❌ ${e.message}`);
    process.exit(1);
  });
  console.log(`   ✅ OK (${Date.now() - t0}ms)`);

  // 2) Empresa host
  console.log('\n→ Resolviendo empresa host (con pagosimpleContributorId)…');
  const empresa = await resolverEmpresaHost();
  if (!empresa || !empresa.pagosimpleContributorId || !empresa.arl) {
    console.error('   ❌ No hay empresa con pagosimpleContributorId en BD.');
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(
    `   ✅ ${empresa.nombre} (NIT ${empresa.nit}, contribId=${empresa.pagosimpleContributorId})`,
  );

  // 3) BDUA/RUAF
  console.log('\n→ POST /bdua-ruaf/data');
  const bdua = await consultarBduaRuaf(cfg, loginData, args.tipo, args.doc);
  let codEps = '';
  let codAfp = '';
  let codCcf = '';
  let fuente = 'DEFAULT';
  if (bdua && (bdua.epsCodMin || bdua.afpCodMin)) {
    codEps = bdua.epsCodMin;
    codAfp = bdua.afpCodMin;
    fuente = 'BDUA';
    console.log(
      `   ✅ EPS=${codEps || '—'} · AFP=${codAfp || '—'} · pensionado=${bdua.isPensionary ?? '—'}`,
    );
  } else {
    console.log('   ⚠  Sin registros en BDUA/RUAF — usando defaults del catálogo.');
  }
  if (!codEps) {
    const e = await resolverEntidadDefault('EPS');
    codEps = e.codigo;
    console.log(`     ↳ EPS default: ${e.nombre} (${codEps})`);
  }
  if (!codAfp) {
    const a = await resolverEntidadDefault('AFP');
    codAfp = a.codigo;
    console.log(`     ↳ AFP default: ${a.nombre} (${codAfp})`);
  }
  const c = await resolverEntidadDefault('CCF');
  codCcf = c.codigo;
  console.log(`     ↳ CCF default: ${c.nombre} (${codCcf})`);

  // 4) Construcción del plano sintético
  console.log('\n→ Construyendo plano E sintético (6 líneas)…');
  const now = new Date();
  const periodo = { anio: now.getUTCFullYear(), mes: now.getUTCMonth() + 1 };
  const periodoSalud =
    periodo.mes === 12
      ? { anio: periodo.anio + 1, mes: 1 }
      : { anio: periodo.anio, mes: periodo.mes + 1 };
  const fechaIngreso = new Date(Date.UTC(periodo.anio, periodo.mes - 1, 1));
  const arlInfo = empresa.arl;
  const empresaHost: EmpresaHost = {
    pagosimpleContributorId: empresa.pagosimpleContributorId,
    nit: empresa.nit,
    dv: empresa.dv,
    nombre: empresa.nombre,
    codArl: arlInfo.codigoMinSalud ?? arlInfo.codigo,
    exoneraLey1607: empresa.exoneraLey1607,
  };
  const cotizante: Cotizante = {
    tipoDocumento: args.tipo,
    numeroDocumento: args.doc,
    primerNombre: 'COTIZANTE',
    segundoNombre: null,
    primerApellido: 'PRUEBA',
    segundoApellido: null,
    codDepto: empresa.departamentoRef?.codigo ?? '11',
    codMuni: empresa.municipioRef?.codigo ?? '001',
    codEps,
    codAfp,
    codCcf,
  };

  const encabezado = construirEncabezado({
    empresa: empresaHost,
    sucursalCodigo: 'PRUEBA',
    sucursalNombre: 'Validacion subtipos',
    totalEmpleados: SUBTIPOS.length,
    totalNomina: SMLV * SUBTIPOS.length,
    periodoOtros: periodo,
    periodoSalud,
  });
  const lineas = SUBTIPOS.map((s, idx) =>
    construirLinea({
      secuencia: idx + 1,
      empresa: empresaHost,
      cotizante,
      subtipo: s,
      fechaIngreso,
    }),
  );
  const contenido = [encabezado, ...lineas].join('\r\n') + '\r\n';
  const filename = `validacion-subtipos-${args.doc}.txt`;
  console.log(`   ✅ ${SUBTIPOS.length} líneas · ${contenido.length} bytes · ${filename}`);

  if (args.raw) {
    console.log('\n📄 Plano generado:');
    console.log('---');
    console.log(contenido);
    console.log('---');
  }

  // 5) Auth_token de la empresa
  console.log('\n→ GET /auth/{contribId}/NI/{nit}');
  const authToken = await getAuthToken(
    cfg,
    loginData,
    empresaHost.pagosimpleContributorId,
    'NI',
    empresaHost.nit,
  ).catch((e: Error) => {
    console.error(`   ❌ ${e.message}`);
    process.exit(1);
  });
  console.log(`   ✅ auth_token: ${authToken.slice(0, 16)}…`);

  // 6) POST /payroll/validate
  console.log('\n→ POST /payroll/validate (multipart, file_type=I, header E)');
  const fd = new FormData();
  fd.append(
    'payroll_file',
    new Blob([new Uint8Array(Buffer.from(contenido, 'utf-8'))], { type: 'text/plain' }),
    filename,
  );
  fd.append(
    'execution_params',
    JSON.stringify({ is_UGPP: false, is_novelties_planillaN: false, file_type: 'I' }),
  );

  const t1 = Date.now();
  const resp = await fetch(`${cfg.baseUrl}/payroll/validate`, {
    method: 'POST',
    headers: {
      nit: cfg.masterNit,
      token: loginData.token,
      session_token: loginData.session_token,
      auth_token: authToken,
    },
    body: fd,
  });
  const rawJson = await resp.text();
  const dt = Date.now() - t1;
  console.log(`   ← HTTP ${resp.status} · ${dt}ms · ${rawJson.length} bytes`);

  let parsed: {
    success?: boolean;
    code?: number;
    message?: string;
    description?: string;
    data?: {
      validation_status?: string;
      payroll_validations?: Array<{
        payroll_code?: number;
        payroll_number?: number;
        number_errors_contributor?: number;
        number_errors_company?: number;
        number_warnings?: number;
        detail_errors_contributor?: Array<{
          description: string;
          row: string;
          identification?: string;
        }>;
        detail_errors_company?: Array<{ description: string; row: string }>;
        detail_warnings?: Array<{ description: string; row: string }>;
      }>;
    };
  };
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    console.error('\n❌ Respuesta no-JSON:');
    console.error(rawJson.slice(0, 500));
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('\n📦 Response (parseado):');
  console.log(JSON.stringify(parsed, null, 2));

  // 7) Análisis: subtipos válidos vs rechazados
  if (parsed.success && parsed.data) {
    const first = parsed.data.payroll_validations?.[0];
    console.log('\n🔎 Análisis de subtipos:');
    if (!first) {
      console.log('   ⚠  PagoSimple no devolvió payroll_validations.');
    } else {
      const errs = first.detail_errors_contributor ?? [];
      const erroresPorSubtipo: Record<string, string[]> = {};
      for (const s of SUBTIPOS) erroresPorSubtipo[s] = [];
      for (const e of errs) {
        const row = Number(e.row);
        if (!Number.isFinite(row) || row < 1 || row > SUBTIPOS.length) continue;
        const subtipo = SUBTIPOS[row - 1];
        if (subtipo) erroresPorSubtipo[subtipo]!.push(e.description);
      }
      const tableRows: Array<{ subtipo: string; estado: string; razon: string }> = [];
      for (const s of SUBTIPOS) {
        const errors = erroresPorSubtipo[s] ?? [];
        tableRows.push({
          subtipo: s,
          estado: errors.length === 0 ? '✅ válido' : '❌ rechazado',
          razon: errors[0] ?? '—',
        });
      }
      console.table(tableRows);

      const validos = tableRows.filter((r) => r.estado.startsWith('✅')).map((r) => r.subtipo);
      console.log(
        `\n   Subtipos válidos: ${validos.length > 0 ? validos.join(' · ') : '(ninguno)'}`,
      );
      console.log(`   Empresa host:     ${empresa.nombre}`);
      console.log(`   Fuente entidades: ${fuente}`);

      if (first.number_errors_company && first.number_errors_company > 0) {
        console.log(`\n⚠  Plano con errores a nivel encabezado (${first.number_errors_company}):`);
        for (const e of first.detail_errors_company ?? []) {
          console.log(`   - ${e.description}`);
        }
      }
    }
  }

  await prisma.$disconnect();
}
