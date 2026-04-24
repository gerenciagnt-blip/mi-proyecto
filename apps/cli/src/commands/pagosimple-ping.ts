/**
 * Comando `pagosimple:ping` — verifica que las credenciales del usuario
 * master de PagoSimple estén configuradas y funcionen.
 *
 * Ejecuta el flujo:
 *   POST /auth/login            → { session_token, token }
 *   GET  /auth/{nit}/{tipo}/{doc} → { auth_token }
 *
 * Reporta:
 *   - config (vars presentes / ausentes)
 *   - latencia de login
 *   - tokens obtenidos (truncados por seguridad)
 *
 * Esta implementación replica la lógica de `apps/web/src/lib/pagosimple/*`
 * deliberadamente para mantener el CLI autosuficiente (no importa desde
 * apps/web, que es un paquete Next no consumible como lib).
 *
 * Uso:
 *   pnpm cli pagosimple:ping
 *
 * Exit: 0 OK, 1 con errores de config/red/auth.
 */

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

function truncate(s: string, len = 12): string {
  if (s.length <= len) return s;
  return `${s.slice(0, len)}…(${s.length} chars)`;
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
  const json = (await resp.json()) as PagosimpleResponse<T>;
  if (!json.success) {
    throw new Error(
      `PagoSimple ${path} — code=${json.code} msg="${json.message}" desc="${json.description}"`,
    );
  }
  if (json.data === null) {
    throw new Error(`PagoSimple ${path} — success=true pero data=null`);
  }
  return json.data;
}

export async function pagosimplePingCommand(): Promise<void> {
  console.log('\n🔌 PagoSimple · ping\n');

  const cfg = loadConfig();
  if ('missing' in cfg) {
    console.error('❌ Configuración incompleta. Faltan variables en .env:');
    for (const v of cfg.missing) console.error(`   - ${v}`);
    console.error('\nDefine esas vars y vuelve a correr `pnpm cli pagosimple:ping`.');
    process.exit(1);
  }

  console.log('✅ Config cargada');
  console.log(`   baseUrl:       ${cfg.baseUrl}`);
  console.log(`   nit:           ${cfg.masterNit}`);
  console.log(`   company:       ${cfg.masterCompany}`);
  console.log(`   document_type: ${cfg.masterDocumentType}`);
  console.log(`   document:      ${cfg.masterDocument}`);
  console.log(`   secret_key:    ${truncate(cfg.masterSecretKey)}`);
  console.log('');

  // Paso 1 · login
  console.log('→ POST /auth/login');
  const t0 = Date.now();
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
    console.error(`   ❌ fallo en login: ${msg}`);
    process.exit(1);
  }
  const dtLogin = Date.now() - t0;
  console.log(`   ✅ OK (${dtLogin} ms)`);
  console.log(`      token:         ${truncate(login.token)}`);
  console.log(`      session_token: ${truncate(login.session_token)}`);
  console.log('');

  // Paso 2 · auth_token del master
  const authPath =
    `/auth/${encodeURIComponent(cfg.masterNit)}` +
    `/${encodeURIComponent(cfg.masterDocumentType)}` +
    `/${encodeURIComponent(cfg.masterDocument)}`;
  console.log(`→ GET ${authPath}`);
  const t1 = Date.now();
  let auth: AuthData;
  try {
    auth = await apiCall<AuthData>(cfg.baseUrl, authPath, {
      method: 'GET',
      headers: {
        nit: cfg.masterNit,
        token: login.token,
        session_token: login.session_token,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`   ❌ fallo en auth: ${msg}`);
    process.exit(1);
  }
  const dtAuth = Date.now() - t1;
  console.log(`   ✅ OK (${dtAuth} ms)`);
  console.log(`      auth_token: ${truncate(auth.auth_token)}`);
  console.log('');

  console.log(`🎉 PagoSimple responde correctamente (total ${dtLogin + dtAuth} ms).`);
  console.log('   El usuario master está listo para consumir el resto de APIs.');
}
