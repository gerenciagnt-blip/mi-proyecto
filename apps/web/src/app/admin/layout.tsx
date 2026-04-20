import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-helpers';
import { logoutAction } from '@/app/dashboard/actions';

const NAV = [
  { href: '/admin', label: 'Inicio' },
  { href: '/admin/sucursales', label: 'Sucursales' },
  { href: '/admin/empresas', label: 'Empresas' },
  { href: '/admin/usuarios', label: 'Usuarios' },
  { href: '/admin/catalogos', label: 'Catálogos' },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
        <div className="flex h-14 items-center border-b border-slate-200 px-4">
          <span className="text-sm font-bold tracking-tight">Sistema PILA</span>
        </div>
        <nav className="flex flex-col p-2 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-slate-700 transition hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-auto border-t border-slate-200 pt-2">
            <Link
              href="/dashboard"
              className="block rounded-md px-3 py-2 text-slate-500 transition hover:bg-slate-100"
            >
              ← Dashboard
            </Link>
          </div>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <p className="text-sm text-slate-500">
            Administración — <span className="font-medium text-slate-700">{session.user.name}</span>
          </p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
            >
              Cerrar sesión
            </button>
          </form>
        </header>
        <main className="flex-1 bg-slate-50 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
