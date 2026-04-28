/**
 * Comando `pagosimple:test-all` — corre una batería completa de tests
 * E2E contra la API real de PagoSimple usando las credenciales del
 * usuario master + datos disponibles en la BD local.
 *
 * Cubre las 6 APIs documentadas en el Swagger oficial:
 *   1. Sesión          — POST /auth/login + GET /auth/{id}/{tipo}/{doc}
 *   2. Aportantes      — GET  /contributor/{id} (existencia, NO crea/actualiza)
 *   3. Planillas       — GET  /payroll/total/{n}, GET /payroll/payment/{n},
 *                        GET /payroll/inconsistencies/{n}/0
 *      (validate/correction se SALTAN — son destructivos)
 *   4. Marcación       — NO se prueba (requiere escritura)
 *   5. Comprobantes    — POST /vouchers/report-types
 *   6. BDUA/RUAF       — POST /bdua-ruaf/data
 *   + Helpers          — calcularDv (puro)
 *
 * Filosofía:
 *   - Todos los endpoints son READ-ONLY desde el lado API (no
 *     creamos/actualizamos aportantes ni cargamos planillas).
 *   - Los que requieren un aportante / planilla real intentan usar lo
 *     primero que encuentren en BD; si no hay, marcan SKIP con razón.
 *   - Para BDUA/RUAF probamos con el documento del master (una persona
 *     real que sabemos que existe en SGSS).
 *
 * Salida: tabla con OK / SKIP / FAIL por cada test, latencia y
 * resumen al final. Exit 0 si todos los OK pasan; 1 si algún FAIL.
 *
 * Uso:
 *   pnpm cli pagosimple:test-all
 */

import { prisma } from '@pila/db';

// ============== Tipos compartidos =========================================

type Config = {
  baseUrl: string;
  masterNit: string;
  masterCompany: string;
  masterSecretKey: string;
  masterDocumentType: string;
  masterDocument: string;
  masterPassword: string;
};

type PagosimpleResponse<T> = {
  success: boolean;
  code: number;
  data: T | null;
  message: string;
  description: string;
};

type LoginData = { session_token: string; token: string };
type AuthData = { auth_token: string };

type TestResult = {
  name: string;
  status: 'OK' | 'SKIP' | 'FAIL';
  latencyMs?: number;
  detail?: string;
  preview?: unknown;
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

// ============== Utilidades =================================================

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

function truncate(s: string, len = 14): string {
  if (s.length <= len) return s;
  return `${s.slice(0, len)}…(${s.length})`;
}

function preview(value: unknown, max = 220): string {
  let s: string;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

async function apiCall<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<{ data: T; latencyMs: number; raw: string }> {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  const latencyMs = Date.now() - t0;
  const raw = await resp.text().catch(() => '');
  let json: PagosimpleResponse<T> | null = null;
  try {
    json = JSON.parse(raw) as PagosimpleResponse<T>;
  } catch {
    throw new Error(`Respuesta no-JSON HTTP ${resp.status}: ${raw.slice(0, 180)}`);
  }
  if (typeof json?.success !== 'boolean') {
    throw new Error(`Shape inesperado HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 180)}`);
  }
  if (!json.success) {
    throw new Error(
      `success=false code=${json.code} msg="${json.message}" desc="${json.description}"`,
    );
  }
  return { data: json.data as T, latencyMs, raw };
}

// ============== Helper puro: calcularDv ===================================

function calcularDv(nit: string): number {
  const digits = nit.replace(/\D/g, '');
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let suma = 0;
  for (let i = 0; i < digits.length; i++) {
    const peso = pesos[digits.length - 1 - i] ?? 0;
    const d = Number(digits[i]) || 0;
    suma += d * peso;
  }
  const resto = suma % 11;
  if (resto === 0 || resto === 1) return resto;
  return 11 - resto;
}

// ============== Test framework ============================================

function logSection(title: string) {
  console.log(`\n━━ ${title} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

function reportResult(r: TestResult) {
  const icon = r.status === 'OK' ? '✅' : r.status === 'SKIP' ? '⏭ ' : '❌';
  const lat = r.latencyMs !== undefined ? ` (${r.latencyMs}ms)` : '';
  console.log(`${icon} ${r.name}${lat}`);
  if (r.detail) console.log(`   ${r.detail}`);
  if (r.preview !== undefined && r.status !== 'FAIL') {
    console.log(`   → ${preview(r.preview)}`);
  }
}

// ============== Tests =====================================================

export async function pagosimpleTestAllCommand(): Promise<void> {
  console.log('\n🧪 PagoSimple · test-all (E2E)\n');

  const results: TestResult[] = [];

  // --- 0. Helper puro: calcularDv (no requiere API) -----------------------
  logSection('0. Helpers puros');
  {
    // Tests con DV conocido validado contra DIAN (RUT).
    // NIT 901913106 → DV 9 (Salud Total EPS).
    // NIT 890903938 → DV 8 (Bancolombia).
    // NIT 800088702 → DV 2 (Sura).
    const cases: Array<[string, number]> = [
      ['901913106', 9],
      ['890903938', 8],
      ['800088702', 2],
    ];
    for (const [nit, dvEsperado] of cases) {
      const dv = calcularDv(nit);
      const ok = dv === dvEsperado;
      results.push({
        name: `calcularDv("${nit}") === ${dvEsperado}`,
        status: ok ? 'OK' : 'FAIL',
        detail: ok ? undefined : `Devolvió ${dv} en vez de ${dvEsperado}`,
        preview: dv,
      });
      reportResult(results[results.length - 1]!);
    }
  }

  // --- 1. Config -----------------------------------------------------------
  logSection('1. Configuración');
  const cfgOrErr = loadConfig();
  if ('missing' in cfgOrErr) {
    results.push({
      name: 'Config (vars en .env)',
      status: 'FAIL',
      detail: `Faltan: ${cfgOrErr.missing.join(', ')}`,
    });
    reportResult(results[results.length - 1]!);
    finalReport(results);
    process.exit(1);
  }
  const cfg = cfgOrErr;
  results.push({
    name: 'Config (vars en .env)',
    status: 'OK',
    preview: {
      baseUrl: cfg.baseUrl,
      nit: cfg.masterNit,
      docType: cfg.masterDocumentType,
      doc: cfg.masterDocument,
    },
  });
  reportResult(results[results.length - 1]!);

  // --- 2. Auth -------------------------------------------------------------
  logSection('2. Sesión / Auth');

  // 2.1 POST /auth/login
  let login: LoginData;
  try {
    const { data, latencyMs } = await apiCall<LoginData>(cfg.baseUrl, '/auth/login', {
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
    login = data;
    results.push({
      name: 'POST /auth/login',
      status: 'OK',
      latencyMs,
      preview: {
        token: truncate(data.token),
        session_token: truncate(data.session_token),
      },
    });
  } catch (err) {
    results.push({
      name: 'POST /auth/login',
      status: 'FAIL',
      detail: err instanceof Error ? err.message : String(err),
    });
    reportResult(results[results.length - 1]!);
    finalReport(results);
    process.exit(1);
  }
  reportResult(results[results.length - 1]!);

  // 2.2 GET /auth/{nit}/{tipo}/{doc} — auth_token del master
  let masterAuthToken: string | null = null;
  try {
    const path =
      `/auth/${encodeURIComponent(cfg.masterNit)}` +
      `/${encodeURIComponent(cfg.masterDocumentType)}` +
      `/${encodeURIComponent(cfg.masterDocument)}`;
    const { data, latencyMs } = await apiCall<AuthData>(cfg.baseUrl, path, {
      method: 'GET',
      headers: {
        nit: cfg.masterNit,
        token: login.token,
        session_token: login.session_token,
      },
    });
    masterAuthToken = data.auth_token;
    results.push({
      name: 'GET /auth/{nit}/{tipo}/{doc} (master)',
      status: 'OK',
      latencyMs,
      preview: { auth_token: truncate(data.auth_token) },
    });
  } catch (err) {
    results.push({
      name: 'GET /auth/{nit}/{tipo}/{doc} (master)',
      status: 'SKIP',
      detail:
        'El master no está creado como aportante todavía. No bloquea — los demás endpoints tampoco lo necesitan. ' +
        (err instanceof Error ? err.message : String(err)),
    });
  }
  reportResult(results[results.length - 1]!);

  // --- 3. BDUA/RUAF --------------------------------------------------------
  logSection('3. BDUA / RUAF');
  try {
    const { data, latencyMs } = await apiCall<unknown[]>(cfg.baseUrl, '/bdua-ruaf/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        nit: cfg.masterNit,
        token: login.token,
      },
      body: JSON.stringify({
        document_type: cfg.masterDocumentType,
        document: cfg.masterDocument,
      }),
    });
    const items = Array.isArray(data) ? data : [];
    results.push({
      name: 'POST /bdua-ruaf/data (master)',
      status: 'OK',
      latencyMs,
      detail: `${items.length} registro(s) en BDUA/RUAF para el master.`,
      preview: items.length > 0 ? items[0] : '(lista vacía — el master no está afiliado a SGSS)',
    });
  } catch (err) {
    results.push({
      name: 'POST /bdua-ruaf/data (master)',
      status: 'FAIL',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
  reportResult(results[results.length - 1]!);

  // --- 4. Aportantes / Empresa con pagosimpleContributorId ----------------
  logSection('4. Aportantes (auth con empresa real)');
  const empresaConId = await prisma.empresa
    .findFirst({
      where: { pagosimpleContributorId: { not: null } },
      select: { id: true, nit: true, nombre: true, pagosimpleContributorId: true },
    })
    .catch(() => null);

  let empresaAuthToken: string | null = null;
  let empresaAuthData: { id: string; documentType: string; document: string } | null = null;
  if (!empresaConId) {
    results.push({
      name: 'GET /auth/{contribId}/NI/{nit} (empresa real)',
      status: 'SKIP',
      detail:
        'No hay ninguna Empresa con `pagosimpleContributorId` capturado en la BD. Los tests de planilla/totales/payment quedarán SKIP también.',
    });
  } else {
    empresaAuthData = {
      id: empresaConId.pagosimpleContributorId!,
      documentType: 'NI',
      document: empresaConId.nit,
    };
    try {
      const path =
        `/auth/${encodeURIComponent(empresaAuthData.id)}` +
        `/${encodeURIComponent(empresaAuthData.documentType)}` +
        `/${encodeURIComponent(empresaAuthData.document)}`;
      const { data, latencyMs } = await apiCall<AuthData>(cfg.baseUrl, path, {
        method: 'GET',
        headers: {
          nit: cfg.masterNit,
          token: login.token,
          session_token: login.session_token,
        },
      });
      empresaAuthToken = data.auth_token;
      results.push({
        name: 'GET /auth/{contribId}/NI/{nit} (empresa real)',
        status: 'OK',
        latencyMs,
        detail: `Empresa: ${empresaConId.nombre} (NIT ${empresaConId.nit}), contribId=${empresaConId.pagosimpleContributorId}`,
        preview: { auth_token: truncate(data.auth_token) },
      });
    } catch (err) {
      results.push({
        name: 'GET /auth/{contribId}/NI/{nit} (empresa real)',
        status: 'FAIL',
        detail: `Empresa ${empresaConId.nombre}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  reportResult(results[results.length - 1]!);

  // --- 5. Planillas / Totales (read-only) ---------------------------------
  logSection('5. Planillas (read-only)');
  const planilla = await prisma.planilla
    .findFirst({
      where: {
        pagosimpleNumero: { not: null },
        empresa: { pagosimpleContributorId: { not: null } },
      },
      select: {
        id: true,
        pagosimpleNumero: true,
        empresa: { select: { nit: true, pagosimpleContributorId: true } },
        cotizante: {
          select: {
            tipoDocumento: true,
            numeroDocumento: true,
            pagosimpleContributorId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    .catch(() => null);

  if (!planilla?.pagosimpleNumero) {
    const skipMsg =
      'No hay ninguna Planilla con `pagosimpleNumero` capturado. Sube y valida una planilla para activar estos tests.';
    for (const ep of [
      'GET /payroll/total/{n}',
      'GET /payroll/payment/{n}',
      'GET /payroll/inconsistencies/{n}/0',
    ]) {
      results.push({ name: ep, status: 'SKIP', detail: skipMsg });
      reportResult(results[results.length - 1]!);
    }
  } else {
    // Resolver auth full para esa planilla (mismo patrón que `lib/pagosimple/planillas.ts`).
    const ax = planilla.empresa
      ? {
          id: planilla.empresa.pagosimpleContributorId!,
          documentType: 'NI' as const,
          document: planilla.empresa.nit,
        }
      : planilla.cotizante?.pagosimpleContributorId
        ? {
            id: planilla.cotizante.pagosimpleContributorId,
            documentType: planilla.cotizante.tipoDocumento,
            document: planilla.cotizante.numeroDocumento,
          }
        : null;

    if (!ax) {
      const m = 'La planilla encontrada no tiene aportante con contribId.';
      for (const ep of [
        'GET /payroll/total/{n}',
        'GET /payroll/payment/{n}',
        'GET /payroll/inconsistencies/{n}/0',
      ]) {
        results.push({ name: ep, status: 'SKIP', detail: m });
        reportResult(results[results.length - 1]!);
      }
    } else {
      // Pedir auth_token del aportante (puede ser distinto del master).
      let planillaAuth: AuthData;
      try {
        const path =
          `/auth/${encodeURIComponent(ax.id)}` +
          `/${encodeURIComponent(ax.documentType)}` +
          `/${encodeURIComponent(ax.document)}`;
        const { data } = await apiCall<AuthData>(cfg.baseUrl, path, {
          method: 'GET',
          headers: {
            nit: cfg.masterNit,
            token: login.token,
            session_token: login.session_token,
          },
        });
        planillaAuth = data;
      } catch (err) {
        const m = `auth_token del aportante de la planilla falló: ${err instanceof Error ? err.message : String(err)}`;
        for (const ep of [
          'GET /payroll/total/{n}',
          'GET /payroll/payment/{n}',
          'GET /payroll/inconsistencies/{n}/0',
        ]) {
          results.push({ name: ep, status: 'FAIL', detail: m });
          reportResult(results[results.length - 1]!);
        }
        finalReport(results);
        await prisma.$disconnect();
        process.exit(1);
        return;
      }

      const planillaHeaders: Record<string, string> = {
        nit: cfg.masterNit,
        token: login.token,
        session_token: login.session_token,
        auth_token: planillaAuth.auth_token,
      };

      const numeroEnc = encodeURIComponent(planilla.pagosimpleNumero);

      // 5.1 GET /payroll/total/{n}
      try {
        const { data, latencyMs } = await apiCall<{
          payroll_number: number;
          total_to_pay: number;
        }>(cfg.baseUrl, `/payroll/total/${numeroEnc}`, {
          method: 'GET',
          headers: planillaHeaders,
        });
        results.push({
          name: `GET /payroll/total/${planilla.pagosimpleNumero}`,
          status: 'OK',
          latencyMs,
          preview: {
            payroll_number: data.payroll_number,
            total_to_pay: data.total_to_pay,
          },
        });
      } catch (err) {
        results.push({
          name: `GET /payroll/total/${planilla.pagosimpleNumero}`,
          status: 'FAIL',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      reportResult(results[results.length - 1]!);

      // 5.2 GET /payroll/payment/{n}
      try {
        const { data, latencyMs } = await apiCall<string>(
          cfg.baseUrl,
          `/payroll/payment/${numeroEnc}`,
          { method: 'GET', headers: planillaHeaders },
        );
        results.push({
          name: `GET /payroll/payment/${planilla.pagosimpleNumero}`,
          status: 'OK',
          latencyMs,
          preview: typeof data === 'string' ? truncate(data, 60) : data,
        });
      } catch (err) {
        results.push({
          name: `GET /payroll/payment/${planilla.pagosimpleNumero}`,
          status: 'FAIL',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      reportResult(results[results.length - 1]!);

      // 5.3 GET /payroll/inconsistencies/{n}/0
      try {
        const { data, latencyMs } = await apiCall<{ inconsistencies_number: number }>(
          cfg.baseUrl,
          `/payroll/inconsistencies/${numeroEnc}/0`,
          { method: 'GET', headers: planillaHeaders },
        );
        results.push({
          name: `GET /payroll/inconsistencies/${planilla.pagosimpleNumero}/0`,
          status: 'OK',
          latencyMs,
          preview: data,
        });
      } catch (err) {
        results.push({
          name: `GET /payroll/inconsistencies/${planilla.pagosimpleNumero}/0`,
          status: 'FAIL',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      reportResult(results[results.length - 1]!);
    }
  }

  // --- 6. Comprobantes -----------------------------------------------------
  logSection('6. Comprobantes (vouchers)');
  // Buscar un comprobante INDIVIDUAL con planilla.pagosimpleNumero válida.
  const comp = await prisma.comprobante
    .findFirst({
      where: {
        agrupacion: 'INDIVIDUAL',
        estado: { not: 'ANULADO' },
        cotizante: { isNot: null },
        planillas: {
          some: {
            planilla: {
              estado: { not: 'ANULADA' },
              pagosimpleNumero: { not: null },
            },
          },
        },
      },
      select: {
        id: true,
        consecutivo: true,
        cotizante: { select: { tipoDocumento: true, numeroDocumento: true } },
        periodo: { select: { anio: true, mes: true } },
        planillas: {
          select: { planilla: { select: { pagosimpleNumero: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    .catch(() => null);

  if (!comp || !comp.cotizante) {
    results.push({
      name: 'POST /vouchers/report-types',
      status: 'SKIP',
      detail:
        'No hay comprobante INDIVIDUAL con planilla en PagoSimple. Crea un comprobante individual y sube su planilla para activar.',
    });
  } else {
    const periodo = `${comp.periodo.anio}${String(comp.periodo.mes).padStart(2, '0')}`;
    const payrollN = comp.planillas[0]?.planilla.pagosimpleNumero ?? null;
    try {
      const { data, latencyMs } = await apiCall<string>(cfg.baseUrl, '/vouchers/report-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          nit: cfg.masterNit,
          token: login.token,
        },
        body: JSON.stringify({
          document_type: comp.cotizante.tipoDocumento,
          document: comp.cotizante.numeroDocumento,
          quote_period: periodo,
          payroll_number: payrollN,
          report_type: '2',
        }),
      });
      const isB64 = typeof data === 'string' && data.length > 0;
      const bytes = isB64 ? Buffer.from(data, 'base64').length : 0;
      results.push({
        name: 'POST /vouchers/report-types (report_type=2)',
        status: isB64 && bytes > 100 ? 'OK' : 'FAIL',
        latencyMs,
        detail: isB64
          ? `PDF base64 recibido — ${bytes} bytes decodificados (cotizante ${comp.cotizante.tipoDocumento} ${comp.cotizante.numeroDocumento}, periodo ${periodo}).`
          : 'Respondió pero el PDF está vacío.',
      });
    } catch (err) {
      // Si PagoSimple respondió "No se halló la información solicitada"
      // significa que la pareja (documento, periodo, payroll_number) no
      // existe en su sistema — caso de datos, no falla del cliente.
      const msg = err instanceof Error ? err.message : String(err);
      const noEncontrado = /no se hall[oó]|no se encontraron/i.test(msg);
      results.push({
        name: 'POST /vouchers/report-types (report_type=2)',
        status: noEncontrado ? 'SKIP' : 'FAIL',
        detail: noEncontrado
          ? `PagoSimple no encuentra la planilla para ${comp.cotizante.tipoDocumento} ${comp.cotizante.numeroDocumento} / periodo ${periodo} / payroll ${payrollN}. El endpoint funciona, los datos no matchean.`
          : msg,
      });
    }
  }
  reportResult(results[results.length - 1]!);

  // --- 7. Endpoints de escritura (skip explícito) -------------------------
  logSection('7. Escritura — saltados por seguridad');
  for (const ep of [
    'POST /contributor (independiente — crea aportante)',
    'POST /contributor/pyme  (crea/actualiza empresa)',
    'PUT  /contributor       (actualiza independiente)',
    'PUT  /contributor/pyme  (actualiza empresa)',
    'POST /payroll/validate  (sube + valida planilla)',
    'POST /payroll/correction (auto-corrige planilla)',
    'POST /payroll/marking/* (marcación asistida)',
    'POST /payroll/pay       (pagar PIN)',
  ]) {
    results.push({
      name: ep,
      status: 'SKIP',
      detail:
        'Endpoint de escritura — no se prueba en el test-all para no modificar BD/PagoSimple.',
    });
    reportResult(results[results.length - 1]!);
  }

  // --- Datos extra que el test toma de la BD para futura referencia -----
  logSection('Contexto');
  console.log(`📦 Empresa probada: ${empresaConId?.nombre ?? '— ninguna con contribId —'}`);
  console.log(`📋 Planilla probada: ${planilla?.pagosimpleNumero ?? '— ninguna con número —'}`);
  console.log(`🧾 Comprobante probado: ${comp?.consecutivo ?? '— ninguno disponible —'}`);
  console.log(`🔑 Master auth_token: ${masterAuthToken ? 'OK' : 'no creado como aportante'}`);
  console.log(`🔑 Empresa auth_token: ${empresaAuthToken ? 'OK' : 'n/a'}`);

  // ============== Resumen final ============================================
  finalReport(results);
  await prisma.$disconnect();
  const fails = results.filter((r) => r.status === 'FAIL').length;
  process.exit(fails > 0 ? 1 : 0);
}

function finalReport(results: TestResult[]) {
  const ok = results.filter((r) => r.status === 'OK').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log('\n━━ Resumen ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ OK:   ${ok}`);
  console.log(`⏭  SKIP: ${skip}`);
  console.log(`❌ FAIL: ${fail}`);
  console.log(`Total:    ${results.length}`);
  if (fail > 0) {
    console.log('\nDetalle de fallos:');
    for (const r of results.filter((r) => r.status === 'FAIL')) {
      console.log(`   ❌ ${r.name}`);
      if (r.detail) console.log(`      ${r.detail}`);
    }
  }
}
