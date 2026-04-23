'use client';

/**
 * Error boundary raíz del App Router — se monta si un error escapa del
 * layout principal. Reemplaza el fallback de Pages Router (que intenta
 * renderizar <Html> desde next/document).
 *
 * Como es global, tiene que renderizar <html> y <body> él mismo.
 */
export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="max-w-md text-center">
            <p className="text-sm font-medium uppercase tracking-wider text-red-600">
              Error
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">
              Algo salió mal
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              Ocurrió un error inesperado. Intenta nuevamente; si persiste,
              contacta al soporte.
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
