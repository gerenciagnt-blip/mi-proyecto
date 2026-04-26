import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { StorageState } from './session.js';
import { createLogger } from './logger.js';

const log = createLogger('browser');

/**
 * Crea browser + context con configuración típica para AXA Colpatria.
 *
 * - Idioma es-CO y viewport amplio (algunos formularios del portal
 *   tienen tablas que se ven mal en viewports chicos).
 * - Si pasamos `storageState`, el context arranca con cookies cargadas
 *   (sesión cacheada del Sprint 8).
 * - `slowMo` opcional para debugging visual: en .env COLPATRIA_SLOWMO=120.
 * - `headless` controlado por env: COLPATRIA_HEADLESS=false en dev.
 *
 * Cabeceras y user-agent realistas — el informe técnico advierte que el
 * portal puede tener WAF (Akamai/F5). Default Playwright user-agent es
 * suficientemente normal pero forzamos uno explícito para rastrear si
 * alguna vez nos bloquean específicamente.
 */
export async function abrirBrowser(): Promise<Browser> {
  const headless = process.env.COLPATRIA_HEADLESS !== 'false';
  const slowMo = parseInt(process.env.COLPATRIA_SLOWMO ?? '0', 10) || 0;
  log.info({ headless, slowMo }, 'iniciando Chromium');
  return chromium.launch({ headless, slowMo });
}

export async function nuevoContext(
  browser: Browser,
  storageState?: StorageState,
): Promise<BrowserContext> {
  return browser.newContext({
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    viewport: { width: 1366, height: 850 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    storageState: storageState as Parameters<Browser['newContext']>[0] extends infer P
      ? P extends { storageState?: infer S }
        ? S | undefined
        : never
      : never,
  });
}

/**
 * Cierra browser + context limpiamente. Tira-y-olvida si algo falla
 * al cerrar (no queremos que un error de cleanup tape el error real).
 */
export async function cerrarTodo(browser: Browser, context?: BrowserContext): Promise<void> {
  try {
    if (context) await context.close();
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : err }, 'falló close del context');
  }
  try {
    await browser.close();
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : err }, 'falló close del browser');
  }
}

/**
 * Helper: espera a que el overlay "Cargando..." que el portal muestra
 * durante AJAX desaparezca. El bot Python usaba `wait_for_selector
 * state=hidden` con texto literal "Cargando" — replicamos.
 *
 * No tira si el overlay nunca apareció (algunos AJAX son demasiado
 * rápidos para que el spinner se monte). Tira si está visible más de
 * `timeoutMs` (default 15s).
 */
export async function esperarSinOverlay(page: Page, timeoutMs = 15000): Promise<void> {
  try {
    await page.waitForSelector('text=Cargando', { state: 'hidden', timeout: timeoutMs });
  } catch {
    // El selector pudo nunca haber aparecido — eso es OK. Solo logueamos
    // si lleva mucho tiempo realmente bloqueando.
  }
}

/**
 * Espera a que un <select> dependiente termine de cargar sus opciones
 * (típicamente tras un AJAX en cascada). Útil para Departamento→Ciudad,
 * Empresa→Sucursal, etc.
 */
export async function esperarSelectPoblado(
  page: Page,
  selector: string,
  minOpciones = 2,
  timeoutMs = 15000,
): Promise<void> {
  await page.waitForFunction(
    ({ sel, min }) => {
      const el = document.querySelector(sel) as HTMLSelectElement | null;
      return el !== null && el.options.length >= min;
    },
    { sel: selector, min: minOpciones },
    { timeout: timeoutMs },
  );
}
