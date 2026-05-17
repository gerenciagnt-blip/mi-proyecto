/**
 * Salud de la cola de jobs del bot Colpatria.
 *
 * Sirve para 2 cosas:
 *
 *   1) Visualización en la UI (`/admin/configuracion/colpatria-jobs`) —
 *      un banner arriba del listado muestra contadores en vivo y alerta
 *      en rojo si hay jobs "colgados" (PENDING o RUNNING demasiado
 *      tiempo).
 *
 *   2) Cron de health-check (`/api/cron/colpatria-health`) — corre cada
 *      30 min en horario laboral y reporta jobs colgados a Sentry como
 *      warning. Si la cola está sana, el endpoint sale 200 sin emitir
 *      nada (no se quema cuota de Sentry).
 *
 * Umbrales (decididos con el operador):
 *   - PENDING > 30 min → probable que el cron de procesar.yml haya
 *     fallado o no esté corriendo. Worth alerting.
 *   - RUNNING > 15 min → un job real toma 30-60s. Si lleva más de 15
 *     min, el worker probablemente quedó colgado (Playwright timeout
 *     que no levantó excepción, o el job nunca completó la transición).
 *   - RETRYABLE: contador informativo, no es alerta — el flow espera
 *     que el operador los reintente o reprocese.
 */

import { prisma } from '@pila/db';

export const PENDING_STALE_MINUTES = 30;
export const RUNNING_STALE_MINUTES = 15;

export type SaludJobsColpatria = {
  pendingTotal: number;
  pendingStale: number;
  runningTotal: number;
  runningStale: number;
  retryableTotal: number;
  /** Los IDs y timestamps de los jobs colgados, para mostrar en el
   *  banner / mandar a Sentry como contexto. Capado a 20 para no
   *  inflar payloads. */
  stale: Array<{
    id: string;
    status: 'PENDING' | 'RUNNING';
    empresaId: string;
    createdAt: Date;
    startedAt: Date | null;
    minutosColgado: number;
  }>;
};

export async function obtenerSaludJobsColpatria(): Promise<SaludJobsColpatria> {
  const now = new Date();
  const pendingStaleSince = new Date(now.getTime() - PENDING_STALE_MINUTES * 60_000);
  const runningStaleSince = new Date(now.getTime() - RUNNING_STALE_MINUTES * 60_000);

  // 3 contadores totales en paralelo + 1 query para jobs colgados.
  const [pendingTotal, runningTotal, retryableTotal, staleJobs] = await Promise.all([
    prisma.colpatriaAfiliacionJob.count({ where: { status: 'PENDING' } }),
    prisma.colpatriaAfiliacionJob.count({ where: { status: 'RUNNING' } }),
    prisma.colpatriaAfiliacionJob.count({ where: { status: 'RETRYABLE' } }),
    prisma.colpatriaAfiliacionJob.findMany({
      where: {
        OR: [
          { status: 'PENDING', createdAt: { lt: pendingStaleSince } },
          { status: 'RUNNING', startedAt: { lt: runningStaleSince } },
        ],
      },
      select: {
        id: true,
        status: true,
        empresaId: true,
        createdAt: true,
        startedAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
  ]);

  const stale = staleJobs.map((j) => {
    // Para PENDING usamos createdAt (cuánto lleva en la cola).
    // Para RUNNING usamos startedAt (cuánto lleva ejecutándose).
    const referencia = j.status === 'RUNNING' && j.startedAt ? j.startedAt : j.createdAt;
    const minutos = Math.floor((now.getTime() - referencia.getTime()) / 60_000);
    return {
      id: j.id,
      // El cast es seguro: el WHERE filtra a estos 2 estados.
      status: j.status as 'PENDING' | 'RUNNING',
      empresaId: j.empresaId,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      minutosColgado: minutos,
    };
  });

  const pendingStale = stale.filter((s) => s.status === 'PENDING').length;
  const runningStale = stale.filter((s) => s.status === 'RUNNING').length;

  return {
    pendingTotal,
    pendingStale,
    runningTotal,
    runningStale,
    retryableTotal,
    stale,
  };
}
