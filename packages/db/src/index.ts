import { PrismaClient } from '@prisma/client';

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
 * Crea el cliente con un middleware `$extends({ query: ... })` que mide
 * la duración de cada operación y llama al probe global si está seteado.
 *
 * Usamos `$extends` (Prisma 5+) en lugar de `$on('query', ...)` porque
 * éste último no es interceptable de forma confiable cuando OpenTelemetry
 * (Sentry node) está envolviendo el cliente — los eventos se consumen
 * en una capa interna y nunca llegan al listener del usuario.
 *
 * El probe es opt-in: si `globalThis.__pilaQueryProbe` no está seteado,
 * el middleware solo agrega un negligible overhead (Date.now() x2) por
 * operación.
 */
function crearClienteExtendido() {
  const base = new PrismaClient({ log: buildLogLevels() });
  return base.$extends({
    name: 'pila-query-probe',
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        const probe = (globalThis as unknown as { __pilaQueryProbe?: QueryProbe }).__pilaQueryProbe;
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

export * from '@prisma/client';
