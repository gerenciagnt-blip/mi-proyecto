import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@pila/db';
import { CreateUserForm } from './create-form';
import { toggleUserAction } from './actions';

export const metadata = { title: 'Usuarios — Sistema PILA' };
export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  ALIADO_OWNER: 'Dueño Aliado',
  ALIADO_USER: 'Usuario Aliado',
};

export default async function UsuariosPage() {
  const session = await auth();
  const [usuarios, sucursales] = await Promise.all([
    prisma.user.findMany({
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
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
        <p className="mt-1 text-sm text-slate-500">Admins y usuarios de aliados</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Crear nuevo</h2>
        <CreateUserForm sucursales={sucursales} />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
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
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay usuarios
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
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
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
                        <form action={toggleUserAction.bind(null, u.id)}>
                          <button
                            type="submit"
                            className="text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            {u.active ? 'Desactivar' : 'Activar'}
                          </button>
                        </form>
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
