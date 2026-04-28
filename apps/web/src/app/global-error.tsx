'use client';

import { useEffect } from 'react';
import { captureError } from '@/lib/sentry';

/**
 * Error boundary raíz del App Router — se monta si un error escapa del
 * layout principal. Reemplaza el fallback de Pages Router (que intenta
 * renderizar <Html> desde next/document).
 *
 * Como es global, tiene que renderizar <html> y <body> él mismo.
 *
 * Reporta el error a Sentry en `useEffect` (después del primer paint para
 * no bloquear el render del fallback). El `digest` es el ID de error que
 * Next.js asigna en producción — útil para correlacionar con el evento
 * Sentry. La función `captureError` es no-op si SENTRY_DSN no está seteado.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureError(error, {
      scope: 'global-error',
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="max-w-md text-center">
            <p className="text-sm font-medium uppercase tracking-wider text-red-600">Error</p>
            <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">Algo salió mal</h1>
            <p className="mt-3 text-sm text-slate-500">
              Ocurrió un error inesperado. Intenta nuevamente; si persiste, contacta al soporte.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Reintentar
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
