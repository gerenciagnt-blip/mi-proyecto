import Link from 'next/link';
import { prisma } from '@pila/db';
import { CreateEmpresaForm } from './create-form';
import { toggleEmpresaAction } from './actions';

export const metadata = { title: 'Empresas — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function EmpresasPage() {
  const [empresas, arls, departamentos] = await Promise.all([
    prisma.empresa.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { accesos: true } },
        arl: { select: { codigo: true } },
      },
    }),
    prisma.entidadSgss.findMany({
      where: { tipo: 'ARL', active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
    prisma.departamento.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        municipios: {
          orderBy: { nombre: 'asc' },
          select: { id: true, nombre: true },
        },
      },
    }),
  ]);

  const departamentosOpts = departamentos.map((d) => ({
    id: d.id,
    nombre: d.nombre,
    municipios: d.municipios,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Empresas</h1>
        <p className="mt-1 text-sm text-slate-500">Clientes con NIT único global</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Crear nueva</h2>
        <CreateEmpresaForm arls={arls} departamentos={departamentosOpts} />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">NIT</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">ARL</th>
              <th className="px-4 py-2">Usuarios</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {empresas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay empresas
                </td>
              </tr>
            )}
            {empresas.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-mono text-xs">{e.nit}</td>
                <td className="px-4 py-3">{e.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{e.arl?.codigo ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{e._count.accesos}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      e.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {e.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/empresas/${e.id}`}
                      className="text-xs font-medium text-slate-700 hover:text-slate-900"
                    >
                      Editar
                    </Link>
                    <form action={toggleEmpresaAction.bind(null, e.id)}>
                      <button
                        type="submit"
                        className="text-xs font-medium text-slate-500 hover:text-slate-900"
                      >
                        {e.active ? 'Desactivar' : 'Activar'}
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
