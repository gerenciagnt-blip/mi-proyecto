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
  // Los selectores `input[name='Usuario']` y `input[name='Password']`
  // vienen del informe técnico. Si el portal cambia el `name`, hay que
  // revisar acá.
  await page.fill("input[name='Usuario']", cred.usuario);
  await page.fill("input[name='Password']", cred.password);

  log.info('paso 2: enviando credenciales');
  await page.click("button[type='submit']");

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
  log.info('paso 3: en /Bienvenida — seleccionando perfil');

  // --- Paso 2: selectores de aplicación/perfil/empresa/afiliación ---
  // El orden importa: cada cambio dispara AJAX que repuebla el siguiente.
  // Esperamos overlay tras cada selección.
  await page.selectOption('#ddlAplicaciones', cfg.aplicacion);
  await esperarSinOverlay(page);

  await page.selectOption('#ddlPerfiles', cfg.perfil);
  await esperarSinOverlay(page);

  // Tras seleccionar el perfil, AXA recarga #ddlEmpresas vía AJAX.
  // Esperamos a que tenga al menos 2 opciones (la default + al menos
  // una empresa real).
  await page.waitForFunction(
    () => {
      const el = document.getElementById('ddlEmpresas') as HTMLSelectElement | null;
      return el !== null && el.options.length >= 2;
    },
    { timeout: 15000 },
  );
  await page.selectOption('#ddlEmpresas', cfg.empresaIdInterno);
  await esperarSinOverlay(page);

  // Misma cascada: empresa → afiliaciones.
  await page.waitForFunction(
    () => {
      const el = document.getElementById('ddlAfiliaciones') as HTMLSelectElement | null;
      return el !== null && el.options.length >= 1;
    },
    { timeout: 15000 },
  );
  await page.selectOption('#ddlAfiliaciones', cfg.afiliacionId);
  await esperarSinOverlay(page);

  log.info('paso 4: enviando SegundoPaso');

  // El submit hace POST /SegundoPaso y redirige al portal interno.
  // No siempre va a la home del portal — depende del perfil. Lo
  // importante: ya no estamos en `/Bienvenida`.
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.click("form button[type='submit']"),
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
