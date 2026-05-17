/**
 * Endpoint de alerta — recibe un POST cuando el workflow de backup
 * de la BD falla. Loggea como `error` → forwardToSentry lo captura.
 *
 * Llamado solo desde GitHub Actions con `if: failure()`. No es un cron;
 * es un webhook one-shot que dispara el workflow al fallar.
 *
 * Auth: Bearer CRON_SECRET (mismo patrón que los otros endpoints cron).
 *
 * Payload esperado (JSON):
 *   {
 *     "workflow": "db-backup",
 *     "runUrl": "https://github.com/.../actions/runs/123",
 *     "step": "Run pg_dump" (opcional),
 *     "details": "Mensaje libre" (opcional)
 *   }
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createLogger } from '@/lib/logger';

const log = createLogger('cron-backup-alert');

export const dynamic = 'force-dynamic';

type AlertPayload = {
  workflow: string;
  runUrl?: string;
  step?: string;
  details?: string;
};

export async function POST(request: Request) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') ?? '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match || match[1] !== cronSecret) {
      log.warn({ hasAuth: !!auth }, 'backup-alert rechazado — Authorization no coincide');
      return new NextResponse('Unauthorized', { status: 401 });
    }
  } else {
    const hdrs = await headers();
    const host = hdrs.get('host') ?? '';
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    if (!isLocal) {
      return new NextResponse('CRON_SECRET no configurado', { status: 403 });
    }
  }

  let payload: AlertPayload;
  try {
    payload = (await request.json()) as AlertPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  if (!payload.workflow) {
    return NextResponse.json({ ok: false, error: 'workflow es requerido' }, { status: 400 });
  }

  // Log nivel error → forwardToSentry (lib/logger.ts:93)
  log.error(
    {
      workflow: payload.workflow,
      runUrl: payload.runUrl,
      step: payload.step,
      details: payload.details,
    },
    `Backup falló: ${payload.workflow}${payload.step ? ` (step: ${payload.step})` : ''}`,
  );

  return NextResponse.json({ ok: true, alerted: true });
}
