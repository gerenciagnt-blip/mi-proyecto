import type { QueryProbe } from '@pila/db';
import { createLogger } from './logger';
import { captureMessage } from './sentry';

/**
 * Slow query log de Prisma — opt-in.
 *
 * **Estado operativo:** desactivado por default. En este proyecto el
 * cliente Prisma queda envuelto por `@sentry/node`'s `prismaIntegration`
 * (OpenTelemetry), la cual consume los hooks de `$extends` antes de
 * que lleguen a este probe. Eso significa que aunque el probe esté
 * registrado, no recibe eventos en runtime productivo.
 *
 * **Por qué no es problema:** Sentry ya hace el slow query tracking
 * nativamente. En el dashboard de Sentry → Performance → Database queries
 * se ven todas las queries con su duración, breakdowns por endpoint,
 * y alertas configurables.
 *
 * **Cuándo activar este probe:** si Sentry se desactiva (DSN no
 * configurado) o si necesitas queries lentas en logs locales sin
 * arrancar Sentry. Setea `PILA_QUERY_PROBE=true` en .env.
 *
 * Política cuando está activo:
 *   - Operación > umbralWarn (default 500ms) → log warn con modelo,
 *     operación y duración.
 *   - Operación > umbralCritico (default 2000ms) → adicionalmente
 *     captureMessage a Sentry como warning.
 *
 * Configuración por env vars:
 *   - PILA_QUERY_PROBE=true   activa el probe
 *   - SLOW_QUERY_WARN_MS      umbral warn (default 500)
 *   - SLOW_QUERY_CRITICAL_MS  umbral crítico (default 2000)
 */

const log = createLogger('db');

let yaInstalado = false;

export function instrumentarPrisma(): void {
  if (yaInstalado) return;
  yaInstalado = true;

  // Opt-in: si la env var no está seteada, no registramos el probe.
  // El cliente Prisma seguirá midiendo (overhead despreciable) pero el
  // callback nunca se llamará y no habrá log alguno.
  if (process.env.PILA_QUERY_PROBE !== 'true') return;

  const umbralWarn = parseInt(process.env.SLOW_QUERY_WARN_MS ?? '500', 10);
  const umbralCritico = parseInt(process.env.SLOW_QUERY_CRITICAL_MS ?? '2000', 10);

  // Validamos los umbrales — defaults razonables si vienen mal.
  const warn = Number.isFinite(umbralWarn) && umbralWarn > 0 ? umbralWarn : 500;
  const critico = Number.isFinite(umbralCritico) && umbralCritico > warn ? umbralCritico : 2000;

  const probe: QueryProbe = ({ model, operation, durationMs }) => {
    if (durationMs < warn) return;

    const payload = {
      model: model ?? '<raw>',
      operation,
      durationMs,
    };

    if (durationMs >= critico) {
      log.warn(payload, `Slow query CRÍTICA (${durationMs}ms)`);
      // Sentry: warning, no error — esto es alerta de performance, no
      // un fallo de aplicación.
      void captureMessage(`Slow query (${durationMs}ms)`, 'warning', payload);
    } else {
      log.warn(payload, `Slow query (${durationMs}ms)`);
    }
  };

  // Asignación al globalThis con shape tipado — el cliente Prisma lee
  // de ahí en cada operación.
  (globalThis as unknown as { __pilaQueryProbe?: QueryProbe }).__pilaQueryProbe = probe;

  log.info({ umbralWarnMs: warn, umbralCriticoMs: critico }, 'Slow query log de Prisma instalado');
}
