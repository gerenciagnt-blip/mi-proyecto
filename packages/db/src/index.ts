// IMPORTAR DESDE LA RUTA CUSTOM — ver comentario en `prisma/schema.prisma`
// (output del generator). Usar `@prisma/client` directamente rompe en
// Windows + pnpm + Next 15 con "Prisma Client could not locate the Query Engine".
import { PrismaClient } from './generated/client';

/**
 * Tipo del callback opt-in que recibe métricas de cada operación Prisma.
 * Se setea desde el web app (apps/web/src/lib/db-instrumentation.ts) al
 * arranque vía `globalThis.__pilaQueryProbe`. Este paquete (`@pila/db`) no
 * depende de Pino ni Sentry — solo expone el hook.
 *
 * NOTA OPERATIVA (Sprint 7.1):
 * En este proyecto el cliente queda envuelto por `@sentry/node`'s
 * `prismaIntegration` que usa OpenTelemetry para trazar cada query. Esa
 * integración consume los hooks de `$extends` antes de que lleguen a
 * éste, así que el probe no se dispara en producción aunque esté
 * configurado.
 *
 * No es un problema de operación: Sentry ya captura las queries lentas
 * automáticamente y las muestra en su dashboard como spans con duración
 * (filtras por `db.statement.execute` con `duration > 500ms` para verlas).
 *
 * Mantenemos el probe en código por dos razones:
 *   1. Si en algún futuro Sentry se desactiva, el probe vuelve a ser
 *      la red de seguridad para detectar queries lentas localmente.
 *   2. Permite tests locales con `PILA_QUERY_PROBE=true` sin necesidad
 *      de una instancia de Sentry funcionando.
 */
export type QueryProbe = (info: {
  model: string | undefined;
  operation: string;
  durationMs: number;
}) => void;

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof crearClienteExtendido>;
  __pilaQueryProbe?: QueryProbe;
};

/**
 * Log level configurable por env var PRISMA_LOG.
 *   - sin setear (default prod): solo ['error']
 *   - dev default:              ['error', 'warn']
 *   - PRISMA_LOG=query:          agrega 'query' a stdout (debug local)
 *   - PRISMA_LOG=info:           agrega 'info' y 'query'
 */
function buildLogLevels() {
  const base: Array<'error' | 'warn' | 'query' | 'info'> = ['error'];
  if (process.env.NODE_ENV !== 'production') base.push('warn');
  if (process.env.PRISMA_LOG === 'query') base.push('query');
  if (process.env.PRISMA_LOG === 'info') base.push('info', 'query');
  return base;
}

/**
 * Detección de errores transitorios de conectividad — típicos de Neon
 * (free tier) que suspende el compute después de unos minutos de
 * inactividad. La PRIMERA query después del despertar suele fallar con
 * "Can't reach database server" mientras el endpoint se levanta.
 *
 * Reintentamos SOLO esos errores. Errores de validación, constraints,
 * permisos, etc. se propagan de inmediato.
 *
 * Las transacciones (`$transaction`) NO entran al middleware $allOperations
 * de Prisma — ahí no hay riesgo de duplicación si reintentamos a ciegas.
 * Aún así, el middleware solo reintenta cuando el error es de conectividad
 * (no de constraint/lógica), por lo que es seguro: el query no llegó al
 * servidor en el primer intento.
 */
const RETRY_PATTERNS = [
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

const RETRY_DELAYS_MS = [400, 1200];

function esErrorTransitorio(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return RETRY_PATTERNS.some((p) => msg.includes(p));
}

/**
 * Crea el cliente con DOS middlewares encadenados via `$extends`:
 *
 *   1. `pila-cold-start-retry` — reintenta queries individuales que
 *      fallan con error de conectividad transitorio (cold-start de
 *      Neon, network blip). Backoff 400ms + 1200ms, max 3 intentos.
 *      Sin pino aquí (este package no depende del logger del web app)
 *      — usa console.warn que basta para diagnosticar en dev.
 *
 *   2. `pila-query-probe` — mide la duración de cada operación y llama
 *      al probe global si está seteado.
 *
 * Usamos `$extends` (Prisma 5+) en lugar de `$on('query', ...)` porque
 * éste último no es interceptable de forma confiable cuando OpenTelemetry
 * (Sentry node) está envolviendo el cliente — los eventos se consumen
 * en una capa interna y nunca llegan al listener del usuario.
 */
function crearClienteExtendido() {
  const base = new PrismaClient({ log: buildLogLevels() });
  return base
    .$extends({
      name: 'pila-cold-start-retry',
      query: {
        $allOperations: async ({ model, operation, args, query }) => {
          let lastErr: unknown;
          for (let intento = 0; intento <= RETRY_DELAYS_MS.length; intento++) {
            try {
              return await query(args);
            } catch (err) {
              lastErr = err;
              if (!esErrorTransitorio(err) || intento === RETRY_DELAYS_MS.length) {
                throw err;
              }
              const wait = RETRY_DELAYS_MS[intento]!;
              // eslint-disable-next-line no-console
              console.warn(
                `[prisma] cold-start transitorio (${model ?? 'raw'}.${operation}) — reintento en ${wait}ms`,
              );
              await new Promise((r) => setTimeout(r, wait));
            }
          }
          throw lastErr;
        },
      },
    })
    .$extends({
      name: 'pila-query-probe',
      query: {
        $allOperations: async ({ model, operation, args, query }) => {
          const probe = (globalThis as unknown as { __pilaQueryProbe?: QueryProbe })
            .__pilaQueryProbe;
          if (!probe) return query(args);
          const start = Date.now();
          try {
            return await query(args);
          } finally {
            probe({ model, operation, durationMs: Date.now() - start });
          }
        },
      },
    });
}

export const prisma = globalForPrisma.prisma ?? crearClienteExtendido();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Tipo del cliente extendido que se exporta. Usar este tipo en cualquier
 * helper que reciba el cliente como parámetro (en lugar de `PrismaClient`,
 * que es el tipo del cliente base sin la extensión `$allOperations`).
 */
export type PilaPrismaClient = typeof prisma;

export * from './generated/client';
