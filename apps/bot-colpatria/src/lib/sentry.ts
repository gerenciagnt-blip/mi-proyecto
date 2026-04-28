/**
 * Wrapper de Sentry para el bot Colpatria — patrón paralelo al de
 * `apps/web/src/lib/sentry.ts`.
 *
 * Diseño:
 *   - Si `SENTRY_DSN` no está seteado, las funciones son no-op (el bot
 *     corre en GH Actions sin Sentry y eso es OK).
 *   - Inicialización perezosa: la primera llamada a captureError carga
 *     el SDK. No costo de bundle si Sentry está apagado.
 *   - El bot es Node puro (no Next), así que usamos `@sentry/node`.
 *
 * Uso típico:
 *   import { captureError } from './lib/sentry.js';
 *   try { ... } catch (err) {
 *     await captureError(err, { scope: 'procesar', empresaId, jobId });
 *     throw err;
 *   }
 */

import { createLogger } from './logger.js';

const log = createLogger('sentry');

type SentryState = 'unloaded' | 'enabled' | 'disabled';
let state: SentryState = 'unloaded';
type SentryModule = typeof import('@sentry/node');
let sentryModule: SentryModule | null = null;

async function ensureInit(): Promise<SentryModule | null> {
  if (state === 'enabled') return sentryModule;
  if (state === 'disabled') return null;

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    state = 'disabled';
    return null;
  }

  try {
    const mod = await import('@sentry/node');
    mod.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'production', // bot corre en CI = prod
      // Sample conservador — el bot no recibe tantos eventos como el web.
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      // Etiqueta que distingue eventos del bot vs del web app.
      initialScope: {
        tags: { service: '@pila/bot-colpatria' },
      },
    });
    sentryModule = mod;
    state = 'enabled';
    log.info({ env: process.env.NODE_ENV }, 'Sentry (bot) inicializado');
    return mod;
  } catch (err) {
    log.warn({ err: String(err) }, 'Sentry (bot) no se pudo inicializar');
    state = 'disabled';
    return null;
  }
}

/**
 * Captura un error en Sentry. Si Sentry no está configurado, no hace nada.
 *
 * Para el bot, los contextos típicos son:
 *   { scope: 'procesar', empresaId, jobId, intento }
 *   { scope: 'login-auto', empresaId, nit }
 */
export async function captureError(
  err: unknown,
  contexto?: Record<string, unknown>,
): Promise<void> {
  const mod = await ensureInit();
  if (!mod) return;
  try {
    mod.withScope((scope) => {
      if (contexto) {
        for (const [k, v] of Object.entries(contexto)) {
          scope.setExtra(k, v);
        }
      }
      if (err instanceof Error) {
        mod.captureException(err);
      } else {
        mod.captureMessage(String(err), 'error');
      }
    });
  } catch (sErr) {
    log.warn({ err: String(sErr) }, 'captureError (bot) falló');
  }
}

export async function captureMessage(
  mensaje: string,
  nivel: 'info' | 'warning' | 'error' = 'info',
  contexto?: Record<string, unknown>,
): Promise<void> {
  const mod = await ensureInit();
  if (!mod) return;
  try {
    mod.withScope((scope) => {
      if (contexto) {
        for (const [k, v] of Object.entries(contexto)) {
          scope.setExtra(k, v);
        }
      }
      mod.captureMessage(mensaje, nivel);
    });
  } catch (sErr) {
    log.warn({ err: String(sErr) }, 'captureMessage (bot) falló');
  }
}

/**
 * Asegura que los eventos pendientes se envíen antes de que el proceso
 * termine. Llamar al final de un comando del bot (especialmente en GH
 * Actions, donde el runner se apaga al terminar el job).
 */
export async function flushSentry(timeoutMs = 5_000): Promise<void> {
  const mod = await ensureInit();
  if (!mod) return;
  try {
    await mod.flush(timeoutMs);
  } catch {
    // Silencioso — flush en shutdown no debe nunca tirar el proceso.
  }
}

export async function isSentryEnabled(): Promise<boolean> {
  await ensureInit();
  return state === 'enabled';
}
