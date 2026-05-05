/**
 * Hook de Next 15 que se ejecuta UNA vez al arranque del server.
 * Acá montamos instrumentación que debe estar lista antes de que
 * se atienda el primer request.
 *
 * Hoy:
 *   - Slow query log de Prisma (Sprint 7.1)
 *   - Sentry init server-side (eager si SENTRY_DSN está seteado, no-op si no)
 *   - Cron interno Efipay — reconcilia trx PENDIENTE cada 5 min
 *
 * El nombre del archivo (`src/instrumentation.ts`) es convención de
 * Next y está documentado:
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Guard para no registrar múltiples timers en hot reload de dev. */
declare global {
  // eslint-disable-next-line no-var
  var __pilaEfipayCronTimer: NodeJS.Timeout | undefined;
}

export async function register(): Promise<void> {
  // El runtime de Next dispara este hook tanto en Node como en Edge —
  // las features de Prisma + Pino solo aplican en Node, así que nos
  // saltamos el resto si estamos en Edge.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { instrumentarPrisma } = await import('./lib/db-instrumentation');
  instrumentarPrisma();

  // Inicializar Sentry temprano si DSN está configurado. Esto registra
  // los handlers de uncaughtException/unhandledRejection y el wrapper
  // automático de server actions / route handlers / page renders que
  // ofrece @sentry/nextjs. La función `isSentryEnabled` dispara el lazy
  // init que ya está implementado en `lib/sentry.ts` — si no hay DSN, es
  // no-op silencioso.
  if (process.env.SENTRY_DSN) {
    const { isSentryEnabled } = await import('./lib/sentry');
    await isSentryEnabled();
  }

  // Cron interno Efipay: cada 5 minutos consulta el estado real de las
  // trx PENDIENTE en Efipay y actualiza nuestros cobros. Esto cubre los
  // casos donde el webhook NO llega (lo más común en dev sin túnel
  // público). Se desactiva con EFIPAY_AUTOPOLL=off (útil si en prod hay
  // un cron externo dedicado).
  if (process.env.EFIPAY_AUTOPOLL !== 'off' && !globalThis.__pilaEfipayCronTimer) {
    const { createLogger } = await import('./lib/logger');
    const log = createLogger('efipay-autopoll');

    // Importamos perezosamente para no encadenar el arranque al cargar
    // todo el módulo de reconciliación.
    const ejecutar = async () => {
      try {
        const { reconciliarTodasPendientesAction } = await import('./lib/efipay/reconciliacion');
        const result = await reconciliarTodasPendientesAction({
          requireSession: false,
          maxAgeDias: 30,
        });
        if (
          result.consultadas > 0 ||
          result.aprobadas > 0 ||
          result.rechazadas > 0 ||
          result.fallos > 0
        ) {
          log.info(result, 'Autopoll Efipay tick');
        }
      } catch (err) {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          'Autopoll Efipay falló',
        );
      }
    };

    // Disparo inicial con jitter (evita ejecutar exactamente al boot)
    setTimeout(ejecutar, 30_000);
    // Y luego cada 5 min
    globalThis.__pilaEfipayCronTimer = setInterval(ejecutar, FIVE_MINUTES_MS);
    log.info({ intervalMs: FIVE_MINUTES_MS }, 'Autopoll Efipay registrado (cada 5 min)');
  }
}

/**
 * Captura errores que escapen al runtime de Next (page render, route
 * handler, server action). Next 15 expone este hook explícitamente para
 * permitir reporting sin tener que envolver cada API route.
 *
 * Si `SENTRY_DSN` no está seteado, `captureError` es no-op silencioso.
 */
export async function onRequestError(
  err: unknown,
  request: {
    path: string;
    method: string;
    headers: { [key: string]: string };
  },
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string;
    routeType: 'render' | 'route' | 'action' | 'middleware';
    renderSource?:
      | 'react-server-components'
      | 'react-server-components-payload'
      | 'server-rendering';
    revalidateReason?: 'on-demand' | 'stale' | undefined;
  },
): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  const { captureError } = await import('./lib/sentry');
  await captureError(err, {
    scope: 'next-request-error',
    method: request.method,
    path: request.path,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  });
}
