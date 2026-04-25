/**
 * Comando `pagosimple:sync-planillas` — re-consulta el estado de las
 * planillas en CONSOLIDADO contra PagoSimple para actualizar localmente
 * `pagosimpleEstadoValidacion` cuando el operador termine de procesar
 * inconsistencias asíncronas.
 *
 * Pensado para correr en cron cada 15 minutos en horario laboral
 * (8:00-17:00 Bogotá), L-V, vía GitHub Actions.
 *
 * Algoritmo:
 *   1. Listar planillas CONSOLIDADO con `pagosimpleNumero` no nulo.
 *      (las que aún no se subieron o ya están PAGADA se skipean)
 *   2. Por cada una, GET /payroll/inconsistencies/{code}/0 — devuelve
 *      la cantidad y detalle de errores actuales.
 *   3. Determinar nuevo status:
 *        - 0 inconsistencias       → 'OK'
 *        - hay errores empresa/cot → 'ERROR'
 *        - solo warnings           → 'WARNING'
 *   4. Persistir si cambia respecto al último estado guardado.
 *
 * Esta implementación replica la lib de apps/web/src/lib/pagosimple/*
 * para mantener el CLI autosuficiente (no importamos desde apps/web).
 *
 * Uso:
 *   pnpm cli pagosimple:sync-planillas               # solo CONSOLIDADO
 *   pnpm cli pagosimple:sync-planillas --include-pagadas
 *
 * Exit: 0 OK, 1 con errores de red/config.
 */

import { prisma } from '@pila/db';

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

type InconsistenciasResponse = {
  inconsistencies_number: number;
  detail_errors_company?: unknown[];
  detail_errors_contributor?: unknown[];
  detail_warnings?: unknown[];
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

async function apiCall<T>(baseUrl: string, path: string, init: RequestInit): Promise<T> {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let resp: Response;
  try {
    resp = await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  const txt = await resp.text();
  let json: PagosimpleResponse<T>;
  try {
    json = JSON.parse(txt);
  } catch {
    throw new Error(`HTTP ${resp.status} no-JSON: ${txt.slice(0, 150)}`);
  }
  if (!json.success) {
    throw new Error(`code=${json.code} msg="${json.message}"`);
  }
  if (json.data === null) {
    throw new Error('data null');
  }
  return json.data;
}

/** Determina el nuevo estado según lo retornado por inconsistencies. */
function calcularEstado(resp: InconsistenciasResponse): string {
  const numErr = resp.inconsistencies_number ?? 0;
  const errCompany = resp.detail_errors_company?.length ?? 0;
  const errContrib = resp.detail_errors_contributor?.length ?? 0;
  const warnings = resp.detail_warnings?.length ?? 0;
  if (numErr === 0 && errCompany === 0 && errContrib === 0 && warnings === 0) {
    return 'OK';
  }
  if (errCompany > 0 || errContrib > 0) return 'ERROR';
  if (warnings > 0) return 'WARNING';
  return 'OK';
}

export async function pagosimpleSyncPlanillasCommand(opts: {
  includePagadas?: boolean;
}): Promise<void> {
  console.log(`\n🔄 PagoSimple · sync planillas — ${new Date().toISOString()}\n`);

  const cfgOrMissing = loadConfig();
  if ('missing' in cfgOrMissing) {
    console.error('❌ Configuración incompleta. Faltan vars:');
    for (const v of cfgOrMissing.missing) console.error(`   - ${v}`);
    process.exit(1);
    return; // typescript no infiere que process.exit nunca retorna
  }
  const cfg: Config = cfgOrMissing;

  // Listar planillas a procesar
  const planillas = await prisma.planilla.findMany({
    where: {
      pagosimpleNumero: { not: null },
      estado: opts.includePagadas ? { in: ['CONSOLIDADO', 'PAGADA'] } : 'CONSOLIDADO',
    },
    select: {
      id: true,
      consecutivo: true,
      pagosimpleNumero: true,
      pagosimpleEstadoValidacion: true,
      empresa: { select: { nit: true } },
      cotizante: { select: { numeroDocumento: true, tipoDocumento: true } },
    },
  });

  console.log(`→ ${planillas.length} planillas con pagosimpleNumero a consultar`);
  if (planillas.length === 0) {
    console.log('   (nada que hacer)');
    await prisma.$disconnect();
    return;
  }

  // Login una sola vez
  let login: LoginData;
  try {
    login = await apiCall<LoginData>(cfg.baseUrl, '/auth/login', {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Login falló: ${msg}`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('   ✅ login OK');

  // Cache de auth_token por aportante (NIT del master, NIT empresa, etc.)
  const authCache = new Map<string, string>();
  async function getAuth(idCotizante: string, tipoDoc: string, doc: string) {
    const key = `${idCotizante}|${tipoDoc}|${doc}`;
    const hit = authCache.get(key);
    if (hit) return hit;
    const data = await apiCall<AuthData>(
      cfg.baseUrl,
      `/auth/${encodeURIComponent(idCotizante)}/${encodeURIComponent(tipoDoc)}/${encodeURIComponent(doc)}`,
      {
        method: 'GET',
        headers: {
          nit: cfg.masterNit,
          token: login.token,
          session_token: login.session_token,
        },
      },
    );
    authCache.set(key, data.auth_token);
    return data.auth_token;
  }

  let actualizadas = 0;
  let sinCambio = 0;
  let errores = 0;

  for (const p of planillas) {
    try {
      // Determinar el aportante para auth_token
      let id: string, tipoDoc: string, doc: string;
      if (p.empresa) {
        id = p.empresa.nit;
        tipoDoc = 'NI';
        doc = p.empresa.nit;
      } else if (p.cotizante) {
        id = p.cotizante.numeroDocumento;
        tipoDoc = p.cotizante.tipoDocumento;
        doc = p.cotizante.numeroDocumento;
      } else {
        console.warn(`   ⚠ ${p.consecutivo}: sin empresa ni cotizante, saltando`);
        continue;
      }

      const authToken = await getAuth(id, tipoDoc, doc);

      const data = await apiCall<InconsistenciasResponse>(
        cfg.baseUrl,
        `/payroll/inconsistencies/${encodeURIComponent(p.pagosimpleNumero!)}/0`,
        {
          method: 'GET',
          headers: {
            nit: cfg.masterNit,
            token: login.token,
            session_token: login.session_token,
            auth_token: authToken,
          },
        },
      );

      const nuevoEstado = calcularEstado(data);
      if (nuevoEstado !== p.pagosimpleEstadoValidacion) {
        await prisma.planilla.update({
          where: { id: p.id },
          data: {
            pagosimpleEstadoValidacion: nuevoEstado,
            pagosimpleSyncedAt: new Date(),
          },
        });
        console.log(
          `   🔁 ${p.consecutivo}: ${p.pagosimpleEstadoValidacion ?? 'null'} → ${nuevoEstado}`,
        );
        actualizadas++;
      } else {
        sinCambio++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ ${p.consecutivo}: ${msg}`);
      errores++;
    }
  }

  console.log(
    `\n✅ Sync completado — ${actualizadas} actualizadas · ${sinCambio} sin cambio · ${errores} errores`,
  );
  await prisma.$disconnect();
  if (errores > 0) process.exit(1);
}
