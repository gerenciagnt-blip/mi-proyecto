/**
 * Retry wrapper para queries Prisma que pueden fallar por cold-start de
 * Neon (auto-suspend del compute → primera conexión devuelve "Can't reach
 * database server").
 *
 * Lección 2026-04-28 (`feedback_pino_external.md` está como referencia
 * de lecciones aprendidas): los proveedores serverless de Postgres como
 * Neon free tier suspenden el compute después de unos minutos de
 * inactividad. La primera petición lo despierta pero suele tardar 1-3
 * segundos y a veces el primer query falla con error de conexión.
 *
 * Uso:
 *   const status = await withDbRetry(() => getRateLimitStatus(email));
 *
 * Solo reintenta errores que parecen transitorios de conectividad.
 * Errores de validación, constraint, etc. se propagan inmediatamente.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('db-retry');

const DEFAULT_RETRIES = 2;
const DEFAULT_DELAYS_MS = [400, 1200]; // backoff: 400ms, luego 1.2s

/** Marcas de error transitorio típicas de Neon / pgbouncer cold-start. */
const TRANSIENT_PATTERNS = [
  "can't reach database server",
  'connection refused',
  'connection timeout',
  'timed out fetching a new connection',
  'server has closed the connection',
  'econnreset',
  'econnrefused',
  'etimedout',
  'enotfound',
];

function isTransientDbError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return TRANSIENT_PATTERNS.some((p) => msg.includes(p));
}

/**
 * Ejecuta `fn`. Si falla con un error de conectividad transitorio,
 * espera y reintenta hasta `maxRetries` veces (default 2 → 3 intentos
 * en total) con backoff. Errores no transitorios se propagan sin
 * reintento.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; delaysMs?: number[]; label?: string } = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_RETRIES;
  const delays = opts.delaysMs ?? DEFAULT_DELAYS_MS;
  const label = opts.label ?? 'db';

  let lastErr: unknown;
  for (let intento = 0; intento <= maxRetries; intento++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err) || intento === maxRetries) {
        throw err;
      }
      const wait = delays[intento] ?? delays[delays.length - 1] ?? 1000;
      log.warn(
        {
          intento: intento + 1,
          maxRetries: maxRetries + 1,
          waitMs: wait,
          label,
          err: err instanceof Error ? err.message : String(err),
        },
        'DB transitorio — reintentando',
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  // Inalcanzable salvo que maxRetries < 0
  throw lastErr;
}
