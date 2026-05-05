/**
 * Endpoint cron — reconcilia transacciones Efipay PENDIENTE consultando
 * la pasarela.
 *
 * Disparo: el `instrumentation.ts` de la app llama este endpoint cada
 * 5 minutos automáticamente. También se puede invocar externamente
 * (Vercel Cron, GitHub Actions, cron-job.org) si se setea CRON_SECRET.
 *
 * Auth:
 *   - Si está configurada la env var `CRON_SECRET`, se exige header
 *     `Authorization: Bearer <CRON_SECRET>`
 *   - Si NO está configurada (dev local), se permite cualquier llamada
 *     desde localhost o localhost:3000
 *
 * Devuelve JSON con el conteo de transacciones reconciliadas.
 *
 * Métodos: POST (preferido) | GET (fallback para servicios cron simples
 * que solo soportan GET — la action es idempotente, sin riesgo).
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { reconciliarTodasPendientesAction } from '@/lib/efipay/reconciliacion';
import { createLogger } from '@/lib/logger';

const log = createLogger('cron-efipay');

export const dynamic = 'force-dynamic';

async function ejecutar(request: Request) {
  // Auth: si hay CRON_SECRET configurado, lo exigimos
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') ?? '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match || match[1] !== cronSecret) {
      log.warn({ hasAuth: !!auth }, 'Cron rechazado — Authorization no coincide');
      return new NextResponse('Unauthorized', { status: 401 });
    }
  } else {
    // Sin secret — solo permitir llamadas desde localhost
    const hdrs = await headers();
    const host = hdrs.get('host') ?? '';
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    if (!isLocal) {
      log.warn({ host }, 'Cron sin secret y desde host no-localhost — rechazado');
      return new NextResponse(
        'CRON_SECRET no configurado. Setear en .env para habilitar invocación externa.',
        { status: 403 },
      );
    }
  }

  const start = Date.now();
  try {
    const result = await reconciliarTodasPendientesAction({
      requireSession: false,
      maxAgeDias: 30, // no reconcilia trx muy viejas
    });
    const elapsedMs = Date.now() - start;
    log.info({ ...result, elapsedMs }, 'Reconciliación cron completada');
    return NextResponse.json({ ok: true, elapsedMs, ...result });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'Cron falló');
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return ejecutar(request);
}

export async function GET(request: Request) {
  return ejecutar(request);
}
