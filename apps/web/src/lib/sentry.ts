/**
 * Wrapper de Sentry — opcional y lazy.
 *
 * Diseño:
 *   - Si `SENTRY_DSN` no está seteado, las funciones son no-op (silenciosas).
 *   - La inicialización es perezosa: ocurre en la primera llamada a
 *     `captureError` o `captureMessage`. No carga el SDK al arranque.
 *   - El SDK se importa dinámicamente para evitar el costo del bundle
 *     cuando Sentry está apagado (la mayoría del tiempo en dev).
 *
 * Uso típico:
 *
 *   import { captureError } from '@/lib/sentry';
 *
 *   try { ... }
 *   catch (err) {
 *     captureError(err, { scope: 'pagosimple', planillaId });
 *     throw err;  // sigue propagando
 *   }
 *
 * Para errores que ya se loggean con pino, no hace falta llamar acá —
 * el logger ya está enganchado (ver lib/logger.ts).
 */

import { createLogger } from './logger';

const log = createLogger('sentry');

/**
 * Estado de la integración. Se setea en el primer init exitoso. Si la
 * inicialización falla (paquete no instalado o DSN inválido), queda
 * `disabled` y no se vuelve a intentar.
 */
type SentryState = 'unloaded' | 'enabled' | 'disabled';
let state: SentryState = 'unloaded';
type SentryModule = typeof import('@sentry/nextjs');
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
    const mod = await import('@sentry/nextjs');
    mod.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      // Sample rates conservadores: en producción ajustar según volumen.
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
      // Filtrar PII básico — no mandar query strings que puedan contener tokens.
      sendDefaultPii: false,
    });
    sentryModule = mod;
    state = 'enabled';
    log.info({ env: process.env.NODE_ENV }, 'Sentry inicializado');
    return mod;
  } catch (err) {
    log.warn({ err: String(err) }, 'Sentry no se pudo inicializar — queda deshabilitado');
    state = 'disabled';
    return null;
  }
}

/**
 * Captura un error en Sentry. Si Sentry no está configurado, no hace nada.
 *
 * @param err — el error original (Error, string, o cualquier valor).
 * @param contexto — campos extra que se adjuntan al evento (scope, ids, etc.).
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
    // No queremos que un fallo del logger rompa la operación que lo llamó.
    log.warn({ err: String(sErr) }, 'captureError falló');
  }
}

/**
 * Captura un mensaje (no error) — para casos donde queremos visibilidad
 * pero el evento no es excepcional. Ej: "se reintentó la corrección de
 * planilla con éxito".
 */
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
    log.warn({ err: String(sErr) }, 'captureMessage falló');
  }
}

/**
 * Setea el contexto del usuario actual para los próximos eventos.
 * Llamar después del login (si vamos a ese nivel de detalle).
 */
export async function setUser(user: { id: string; email?: string } | null): Promise<void> {
  const mod = await ensureInit();
  if (!mod) return;
  try {
    if (user) {
      mod.setUser({ id: user.id, email: user.email });
    } else {
      mod.setUser(null);
    }
  } catch {
    // ignore
  }
}

/** ¿Está Sentry activo? Útil para tests y para evitar trabajo en vano. */
export async function isSentryEnabled(): Promise<boolean> {
  await ensureInit();
  return state === 'enabled';
}
