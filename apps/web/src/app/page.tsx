import { APP_NAME, APP_VERSION } from '@pila/core';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">Fase 0</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-slate-500">v{APP_VERSION} — scaffolding inicial</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Próximos pasos</h2>
        <ul className="mt-3 list-inside list-decimal space-y-1 text-sm text-slate-700">
          <li>Instalar PostgreSQL y configurar <code>.env</code></li>
          <li>Correr <code>pnpm db:migrate</code> para crear las tablas base</li>
          <li>Fase 1: módulos de <code>auth</code> y <code>usuarios</code></li>
        </ul>
      </section>
    </main>
  );
}
