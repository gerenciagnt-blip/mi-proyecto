import { auth } from '@/auth';
import { LogoutButton } from './logout-button';

export const metadata = {
  title: 'Dashboard — Sistema PILA',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  ALIADO_OWNER: 'Dueño Aliado',
  ALIADO_USER: 'Usuario Aliado',
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  const { name, email, role, sucursalId } = session.user;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Sistema PILA — Fase 1 (auth)</p>
        </div>
        <LogoutButton />
      </header>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Tu sesión</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-500">Nombre</dt>
            <dd className="mt-0.5">{name}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Correo</dt>
            <dd className="mt-0.5">{email}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Rol</dt>
            <dd className="mt-0.5">{ROLE_LABELS[role] ?? role}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Sucursal</dt>
            <dd className="mt-0.5">{sucursalId ?? '— (acceso global)'}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Próximos pasos
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-700">
          <li>CRUD de usuarios (Fase 1.5)</li>
          <li>CRUD de sucursales (Fase 1.5)</li>
          <li>CRUD de empresas + asignación UsuarioEmpresa (Fase 1.6)</li>
        </ul>
      </section>
    </main>
  );
}
