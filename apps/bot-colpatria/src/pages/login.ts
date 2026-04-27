import type { Page } from 'playwright';
import { esperarSinOverlay } from '../lib/browser.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('login');

/**
 * URLs del portal AXA Colpatria. Documentadas en el informe técnico.
 * Si AXA rota dominio o ruta, ajustar acá — ningún otro archivo del bot
 * debe tener URLs hardcoded.
 */
const URL_LOGIN = 'https://aplicaciones.axacolpatria.co/Seguridad/Autenticacion/Autenticacion';
const URL_BIENVENIDA = 'https://aplicaciones.axacolpatria.co/Seguridad/Autenticacion/Bienvenida';
const URL_PORTAL_BASE = 'https://portalarl.axacolpatria.co/PortalARL/';

export type LoginCredenciales = {
  usuario: string;
  password: string;
};

export type ConfigBienvenida = {
  /** Código de Aplicación. Default ARP. */
  aplicacion: string;
  /** Perfil: OFI u OPE. */
  perfil: string;
  /** ID interno empresa AXA (ej. "105787"). */
  empresaIdInterno: string;
  /** Número de afiliación (ej. "9048054"). */
  afiliacionId: string;
};

/**
 * Login completo end-to-end:
 *   1. Carga /Autenticacion/Autenticacion
 *   2. Llena usuario + password + submit
 *   3. Espera redirect a /Bienvenida
 *   4. Selecciona Aplicación → Perfil → Empresa → Afiliación
 *   5. Click "Ingresar" → POST /SegundoPaso → entra al portal interno
 *
 * Tras esto el `page` queda autenticado y se puede navegar a cualquier
 * URL de `/PortalARL/`. El caller es responsable de guardar el
 * `storageState` para reuso.
 *
 * Tira si: credenciales malas, no existe el perfil/empresa solicitada,
 * o la navegación al portal interno excede el timeout.
 */
export async function loginCompleto(
  page: Page,
  cred: LoginCredenciales,
  cfg: ConfigBienvenida,
): Promise<void> {
  log.info({ usuario: cred.usuario }, 'paso 1: cargando página de login');
  await page.goto(URL_LOGIN, { waitUntil: 'networkidle' });

  // --- Paso 1: usuario + password ---
  // El portal AXA renderea labels visibles "Usuario"/"Contraseña" y
  // placeholders en mayúsculas "USUARIO"/"PASSWORD". Usamos selectores
  // resilientes (placeholder + type) en vez de name=, porque los `name`
  // del HTML cambian entre versiones del portal y/o están ofuscados.
  // Si AXA cambia los placeholders, ajustar acá.
  const inputUsuario = page
    .locator(
      "input[placeholder='USUARIO'], input[placeholder='Usuario'], input[name='Usuario'], input[name='username']",
    )
    .first();
  const inputPassword = page.locator("input[type='password']").first();
  await inputUsuario.fill(cred.usuario);
  await inputPassword.fill(cred.password);

  log.info('paso 2: enviando credenciales');
  // Estrategia de submit en cascada — del más resiliente al más específico:
  //   1. Press Enter en el campo password (siempre funciona si el form
  //      tiene <button type="submit"> o handler estándar)
  //   2. Si después de 3s la URL no cambió, intentamos clicks por texto
  //      visible (puede ser <a>, <button> o <input>)
  //
  // El Enter es más confiable porque no depende del tag (button/a/div)
  // ni del texto del CTA. AXA lo respeta.
  await inputPassword.press('Enter');

  // Pequeña espera para ver si Enter disparó la navegación
  let intentoFallback = false;
  try {
    await page.waitForURL((url) => !url.toString().includes('/Autenticacion/Autenticacion'), {
      timeout: 5000,
    });
  } catch {
    intentoFallback = true;
  }

  if (intentoFallback) {
    log.info('Enter no disparó submit — intentando click en CTA visible');
    const btnLogin = page
      .locator(
        // Sin filtro de tag: cualquier elemento con texto "INICIAR SESIÓN"
        // o variantes (case-insensitive substring por defecto).
        'text=/iniciar.{0,3}sesi[óo]n/i',
      )
      .first();
    await btnLogin.click({ timeout: 10000 });
  }

  // Esperamos redirect a /Bienvenida. Si hay error de credenciales, el
  // portal vuelve a mostrar /Autenticacion con un mensaje — detectamos
  // por la URL que NO sea /Bienvenida tras el submit.
  try {
    await page.waitForURL(/\/Bienvenida(\?|$|\/)/, { timeout: 30000 });
  } catch {
    const url = page.url();
    if (url.includes('/Autenticacion/Autenticacion')) {
      throw new Error('Login rechazado por el portal — credenciales inválidas o cuenta bloqueada');
    }
    throw new Error(`Tras submit, URL inesperada: ${url}`);
  }
  log.info({ url: page.url() }, 'paso 3: en /Bienvenida — esperando AJAX inicial');

  // --- Paso 2: selectores de aplicación/perfil/empresa/afiliación ---
  // El portal carga las opciones de los selects vía un AJAX llamado
  // `GetDatosUsuario` justo después de que /Bienvenida renderea.
  // Si llegamos demasiado rápido, los selects están vacíos y
  // `selectOption` se queda esperando 30s sin nada que poder elegir.
  // Esperamos a que la red se calme antes de empezar.
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
    /* networkidle puede no dispararse si AXA mantiene un keep-alive
       abierto — no es crítico, seguimos y dejamos que los waitForFunction
       específicos de cada select hagan su trabajo. */
  });

  // Esperamos que cada select tenga al menos 1 opción real antes de
  // intentar `selectOption`. AXA usa Bootstrap-select, que oculta el
  // `<select>` nativo con CSS — usamos `force: true` en `selectOption`
  // para no chocar con el chequeo de visibilidad de Playwright.
  const esperarOpciones = (id: string, min = 1) =>
    page.waitForFunction(
      ({ id, min }) => {
        const el = document.getElementById(id) as HTMLSelectElement | null;
        return el !== null && el.options.length >= min;
      },
      { id, min },
      { timeout: 15000 },
    );

  await esperarOpciones('ddlAplicaciones', 1);
  await page.selectOption('#ddlAplicaciones', cfg.aplicacion, { force: true });
  await esperarSinOverlay(page);

  await esperarOpciones('ddlPerfiles', 1);
  await page.selectOption('#ddlPerfiles', cfg.perfil, { force: true });
  await esperarSinOverlay(page);

  // Tras seleccionar el perfil, AXA recarga #ddlEmpresas vía AJAX.
  await esperarOpciones('ddlEmpresas', 1);
  await page.selectOption('#ddlEmpresas', cfg.empresaIdInterno, { force: true });
  await esperarSinOverlay(page);

  // Misma cascada: empresa → afiliaciones.
  await esperarOpciones('ddlAfiliaciones', 1);
  await page.selectOption('#ddlAfiliaciones', cfg.afiliacionId, { force: true });
  await esperarSinOverlay(page);

  log.info('paso 4: click en INGRESAR');

  // El botón "Ingresar" es un <input type='submit'>, no <button>.
  // Selector tolerante: por value, por id si lo tuviera, o por type
  // dentro del form principal.
  const btnIngresar = page
    .locator(
      "input[type='submit'][value='Ingresar'], input[value='Ingresar'], input[type='submit']",
    )
    .first();
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    btnIngresar.click({ force: true }),
  ]);

  // Verificamos que llegamos al portal interno o a alguna ruta dentro de
  // PortalARL. Si volvimos a /Autenticacion, algo falló silencioso.
  const urlFinal = page.url();
  if (urlFinal.includes('/Autenticacion/')) {
    throw new Error(
      `SegundoPaso no nos llevó al portal — quedamos en ${urlFinal}. ¿Empresa/afiliación incorrecta?`,
    );
  }

  log.info({ urlFinal }, 'login OK — sesión activa');
}

/**
 * Verifica si la sesión actual es válida visitando una URL del portal
 * interno y chequeando que NO redirija a /Autenticacion. Más rápido y
 * confiable que checar cookies — el portal puede tenerlas pero
 * haberlas invalidado server-side.
 */
export async function sesionValida(page: Page): Promise<boolean> {
  try {
    await page.goto(`${URL_PORTAL_BASE}EmpleadoDependiente/IngresoIndividual`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    const url = page.url();
    return !url.includes('/Autenticacion/');
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'falló verificación de sesión',
    );
    return false;
  }
}

export const URLS = {
  login: URL_LOGIN,
  bienvenida: URL_BIENVENIDA,
  portalBase: URL_PORTAL_BASE,
  ingresoIndividual: `${URL_PORTAL_BASE}EmpleadoDependiente/IngresoIndividual`,
} as const;
