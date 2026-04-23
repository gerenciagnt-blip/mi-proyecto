import Link from 'next/link';
import { Search } from 'lucide-react';
import type { Prisma } from '@pila/db';
import { auth } from '@/auth';
import { prisma } from '@pila/db';
import { CreateUserDialog } from './create-dialog';
import { UsuariosTabs } from './usuarios-tabs';
import { ToggleUserButton } from './toggle-user-button';

export const metadata = { title: 'Usuarios — Sistema PILA' };
export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  ALIADO_OWNER: 'Dueño Aliado',
  ALIADO_USER: 'Usuario Aliado',
};

type SP = { q?: string; sucursalId?: string };

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const sucursalFilter = sp.sucursalId?.trim() ?? '';

  const session = await auth();

  const where: Prisma.UserWhereInput = {};
  if (sucursalFilter) where.sucursalId = sucursalFilter;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { sucursal: { codigo: { contains: q, mode: 'insensitive' } } },
      { sucursal: { nombre: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [usuarios, sucursales] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        sucursal: { select: { codigo: true } },
        _count: { select: { empresas: true } },
      },
    }),
    prisma.sucursal.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
            Usuarios
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Usuarios del sistema, roles y sucursales.
          </p>
        </div>
        <CreateUserDialog sucursales={sucursales} />
      </header>

      <UsuariosTabs />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form
            method="GET"
            action="/admin/usuarios"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Buscar por nombre o correo..."
                  className="h-9 w-full min-w-[240px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
                />
              </div>
              <select
                name="sucursalId"
                defaultValue={sucursalFilter}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">— Todas las sucursales —</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.codigo} — {s.nombre}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-blue-dark"
              >
                Buscar
              </button>
              {(q || sucursalFilter) && (
                <Link
                  href="/admin/usuarios"
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Limpiar
                </Link>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {usuarios.length} {usuarios.length === 1 ? 'resultado' : 'resultados'}
            </p>
          </form>
        </div>

        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Correo</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Sucursal</th>
              <th className="px-4 py-2">Empresas</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {q || sucursalFilter
                    ? 'Sin resultados con los filtros actuales'
                    : 'Aún no hay usuarios — crea el primero con el botón de arriba.'}
                </td>
              </tr>
            )}
            {usuarios.map((u) => {
              const isSelf = session?.user.id === u.id;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3 text-xs">{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {u.sucursal?.codigo ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {u.role === 'ADMIN' ? '—' : u._count.empresas}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        u.active
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-red-50 text-red-700 ring-red-200'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          u.active ? 'bg-emerald-500' : 'bg-red-500'
                        }`}
                      />
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/admin/usuarios/${u.id}`}
                        className="text-xs font-medium text-slate-700 hover:text-slate-900"
                      >
                        Editar
                      </Link>
                      {u.role !== 'ADMIN' && (
                        <Link
                          href={`/admin/usuarios/${u.id}/empresas`}
                          className="text-xs font-medium text-slate-700 hover:text-slate-900"
                        >
                          Empresas
                        </Link>
                      )}
                      {!isSelf && (
                        <ToggleUserButton
                          userId={u.id}
                          activo={u.active}
                          nombre={u.name}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

