/**
 * Helper para registrar la ejecución de un job CLI en `CronRun`. Se usa
 * desde los comandos que se invocan desde GitHub Actions (retention,
 * auditoría purge, uploads cleanup, etc.) para dejar trazabilidad de
 * cuándo corrió cada job y si terminó OK o falló.
 *
 * Patrón de uso:
 *
 *   await ejecutarComoCronRun('retention-daily', async () => {
 *     // ... lógica del job ...
 *     return { output: '120 archivos limpiados' };
 *   });
 *
 * El helper:
 *   - Crea una fila CronRun con status RUNNING al arrancar.
 *   - Ejecuta el callback.
 *   - Al terminar, actualiza la fila a OK con duración + output.
 *   - Si lanza, actualiza a ERROR con el mensaje y propaga el error
 *     (el caller decide el exit code).
 *
 * Idempotencia: cada ejecución crea una fila nueva. No reusamos filas
 * RUNNING que pudieran haber quedado de un crash previo (eso requeriría
 * lock distribuido y no aporta valor — la fila huérfana se ve en el
 * status page como "running por mucho tiempo").
 */

import { prisma } from '@pila/db';

export type CronRunResult = {
  /** Resumen libre que se guarda en el campo `output` para inspección humana. */
  output?: string;
};

export async function ejecutarComoCronRun(
  jobName: string,
  fn: () => Promise<CronRunResult | void>,
): Promise<void> {
  const run = await prisma.cronRun.create({
    data: { jobName, status: 'RUNNING' },
  });
  const startedAt = Date.now();

  try {
    const r = (await fn()) ?? {};
    const durationMs = Date.now() - startedAt;
    await prisma.cronRun.update({
      where: { id: run.id },
      data: {
        status: 'OK',
        finishedAt: new Date(),
        durationMs,
        output: r.output ?? null,
      },
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const mensaje = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    try {
      await prisma.cronRun.update({
        where: { id: run.id },
        data: {
          status: 'ERROR',
          finishedAt: new Date(),
          durationMs,
          error: stack ? `${mensaje}\n${stack}` : mensaje,
        },
      });
    } catch {
      // No queremos que un fallo escribiendo el error tape el original.
    }
    throw err;
  }
}
