import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { prisma } from '@pila/db';
import { UsuariosTabs } from '../usuarios/usuarios-tabs';
import { CreateSucursalForm } from './create-form';
import { toggleSucursalAction, toggleBloqueoMoraAction } from './actions';

export const metadata = { title: 'Sucursales — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function SucursalesPage() {
  const sucursales = await prisma.sucursal.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { users: true } } },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
          Sucursales
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada aliado tiene una sucursal. El bloqueo por mora limita al aliado a ver y pagar su
          cuenta de cobro.
        </p>
      </header>

      <UsuariosTabs />

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Crear nueva</h2>
        <CreateSucursalForm />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Usuarios</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Mora</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sucursales.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay sucursales
                </td>
              </tr>
            )}
            {sucursales.map((s) => (
              <tr key={s.id} className={s.bloqueadaPorMora ? 'bg-amber-50/50' : ''}>
                <td className="px-4 py-3 font-mono text-xs">{s.codigo}</td>
                <td className="px-4 py-3">{s.nombre}</td>
                <td className="px-4 py-3 text-slate-500">{s._count.users}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {s.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {s.bloqueadaPorMora ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      <AlertTriangle className="h-3 w-3" />
                      Bloqueada
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/sucursales/${s.id}`}
                      className="text-xs font-medium text-slate-700 hover:text-slate-900"
                    >
                      Editar
                    </Link>
                    <form action={toggleBloqueoMoraAction.bind(null, s.id)}>
                      <button
                        type="submit"
                        className="text-xs font-medium text-amber-700 hover:text-amber-900"
                        title="Alterna el bloqueo por mora"
                      >
                        {s.bloqueadaPorMora ? 'Desbloquear' : 'Bloquear mora'}
                      </button>
                    </form>
                    <form action={toggleSucursalAction.bind(null, s.id)}>
                      <button
                        type="submit"
                        className="text-xs font-medium text-slate-500 hover:text-slate-900"
                      >
                        {s.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
