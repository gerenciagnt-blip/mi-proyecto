import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Página no encontrada</h1>
        <p className="mt-3 text-sm text-slate-500">
          La ruta que buscas no existe.
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          ← Volver al panel
        </Link>
      </div>
    </main>
  );
}
