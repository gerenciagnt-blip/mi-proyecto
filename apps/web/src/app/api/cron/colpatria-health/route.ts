/**
 * Endpoint cron — health check de la cola de jobs del bot Colpatria.
 *
 * Disparo: GitHub Actions workflow `bot-colpatria-health-check.yml`
 * cada 30 min en horario laboral. También se puede invocar manualmente.
 *
 * Comportamiento:
 *   - Si hay jobs colgados (PENDING > 30 min o RUNNING > 15 min),
 *     emite un log nivel `error` que el logger reenvía automáticamente
 *     a Sentry con los IDs y minutos en contexto.
 *   - Si la cola está sana, no emite nada a Sentry (no se quema cuota).
 *
 * Devuelve JSON con el snapshot para facilitar debugging desde el log
 * de GitHub Actions.
 *
 * Auth: igual que los otros crons — exige `Authorization: Bearer
 * <CRON_SECRET>` si la variable está configurada; sin secret, solo
 * localhost. Métodos GET y POST aceptados (idempotente).
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { obtenerSaludJobsColpatria } from '@/lib/colpatria/salud-jobs';
import { createLogger } from '@/lib/logger';

const log = createLogger('cron-colpatria-health');

export const dynamic = 'force-dynamic';

async function ejecutar(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') ?? '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match || match[1] !== cronSecret) {
      log.warn({ hasAuth: !!auth }, 'cron rechazado — Authorization no coincide');
      return new NextResponse('Unauthorized', { status: 401 });
    }
  } else {
    const hdrs = await headers();
    const host = hdrs.get('host') ?? '';
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    if (!isLocal) {
      log.warn({ host }, 'cron sin secret y host no-localhost — rechazado');
      return new NextResponse(
        'CRON_SECRET no configurado. Setear en .env para habilitar invocación externa.',
        { status: 403 },
      );
    }
  }

  const salud = await obtenerSaludJobsColpatria();
  const colgados = salud.pendingStale + salud.runningStale;

  if (colgados > 0) {
    // Log nivel error → forwardToSentry lo captura automáticamente
    // (ver lib/logger.ts:93). Mandamos el snapshot completo como
    // contexto para que el debug en Sentry sea inmediato.
    log.error(
      {
        pendingStale: salud.pendingStale,
        runningStale: salud.runningStale,
        pendingTotal: salud.pendingTotal,
        runningTotal: salud.runningTotal,
        retryableTotal: salud.retryableTotal,
        jobs: salud.stale.map((j) => ({
          id: j.id,
          status: j.status,
          empresaId: j.empresaId,
          minutosColgado: j.minutosColgado,
        })),
      },
      `Cola Colpatria: ${colgados} job(s) colgados`,
    );
  } else {
    log.info(
      {
        pendingTotal: salud.pendingTotal,
        runningTotal: salud.runningTotal,
        retryableTotal: salud.retryableTotal,
      },
      'cola Colpatria sana',
    );
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    salud: {
      pendingTotal: salud.pendingTotal,
      pendingStale: salud.pendingStale,
      runningTotal: salud.runningTotal,
      runningStale: salud.runningStale,
      retryableTotal: salud.retryableTotal,
      jobsColgados: salud.stale.map((j) => ({
        id: j.id,
        status: j.status,
        empresaId: j.empresaId,
        minutosColgado: j.minutosColgado,
      })),
    },
  });
}

export async function GET(request: Request) {
  return ejecutar(request);
}

export async function POST(request: Request) {
  return ejecutar(request);
}
