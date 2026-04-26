/**
 * Hook de Next 15 que se ejecuta UNA vez al arranque del server.
 * Acá montamos instrumentación que debe estar lista antes de que
 * se atienda el primer request.
 *
 * Hoy:
 *   - Slow query log de Prisma (Sprint 7.1)
 *
 * El nombre del archivo (`src/instrumentation.ts`) es convención de
 * Next y está documentado:
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register(): Promise<void> {
  // El runtime de Next dispara este hook tanto en Node como en Edge —
  // las features de Prisma + Pino solo aplican en Node, así que nos
  // saltamos el resto si estamos en Edge.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { instrumentarPrisma } = await import('./lib/db-instrumentation');
  instrumentarPrisma();
}
