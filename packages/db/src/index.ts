import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Log level configurable por env var PRISMA_LOG.
 *   - sin setear (default prod): solo ['error']
 *   - dev default:              ['error', 'warn']         ← más ligero que antes
 *   - depuración SQL:            'query' → agrega 'query' también
 * Antes se loggeaban todas las queries en dev, lo cual agregaba I/O
 * considerable bajo carga (visible en el load test).
 */
function buildLogLevels() {
  const base: Array<'error' | 'warn' | 'query' | 'info'> = ['error'];
  if (process.env.NODE_ENV !== 'production') base.push('warn');
  if (process.env.PRISMA_LOG === 'query') base.push('query');
  if (process.env.PRISMA_LOG === 'info') base.push('info', 'query');
  return base;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: buildLogLevels(),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
