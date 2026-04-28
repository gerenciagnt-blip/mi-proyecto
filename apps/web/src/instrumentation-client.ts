/**
 * Hook client-side de Next 15 — corre UNA vez al hidratar la app en el
 * browser. Documentado en:
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 *
 * Acá inicializamos Sentry para capturar errores que ocurran en código
 * que corre en el navegador (componentes 'use client', event handlers,
 * fetch fallidos, etc.). Los errores server-side se capturan vía
 * `instrumentation.ts`.
 *
 * Diseño paralelo al de `lib/sentry.ts`:
 *   - Si `NEXT_PUBLIC_SENTRY_DSN` no está seteado, no-op silencioso.
 *   - Lazy import del SDK para no inflar el bundle si Sentry está apagado.
 *   - Sample rate más conservador en prod que en dev.
 *
 * IMPORTANTE: la variable DEBE empezar con `NEXT_PUBLIC_` para que Next
 * la inyecte en el bundle del cliente. La env var `SENTRY_DSN` (sin
 * prefijo) NO está disponible en el browser.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  // Import dinámico para que el bundle del cliente NO incluya el SDK
  // cuando Sentry está apagado en dev (la mayoría del tiempo).
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      // Sample conservador en prod — bajalo a 0.01 si el volumen es alto.
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
      // Replay queda apagado por defecto (cobra extra en sentry.io). Si
      // se activa, ojo con PII en formularios — el form de afiliación
      // tiene cédulas y nombres.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      // Filtrar PII básico — querystrings pueden traer tokens en algunos flujos.
      sendDefaultPii: false,
    });
  });
}

/**
 * Hook que Next 15 invoca cuando se navega entre rutas client-side.
 * Necesario para que el performance tracing de Sentry mida transiciones
 * de SPA correctamente. No tira si Sentry está apagado.
 */
export const onRouterTransitionStart = async (
  href: string,
  navigationType: 'push' | 'replace' | 'traverse',
): Promise<void> => {
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureRouterTransitionStart?.(href, navigationType);
  } catch {
    // Sentry no cargó aún — ignorar silenciosamente.
  }
};
