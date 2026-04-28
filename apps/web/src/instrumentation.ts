/**
 * Hook de Next 15 que se ejecuta UNA vez al arranque del server.
 * Acá montamos instrumentación que debe estar lista antes de que
 * se atienda el primer request.
 *
 * Hoy:
 *   - Slow query log de Prisma (Sprint 7.1)
 *   - Sentry init server-side (eager si SENTRY_DSN está seteado, no-op si no)
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
