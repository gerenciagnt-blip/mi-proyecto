import Link from 'next/link';
import { prisma } from '@pila/db';
import { CreateActividadForm } from './create-form';
import { toggleActividadAction, importActividadesAction } from './actions';
import { ImportForm } from '../_components/import-form';

export const metadata = { title: 'Actividades (CIIU) — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function ActividadesPage() {
  const actividades = await prisma.actividadEconomica.findMany({
    orderBy: { codigoCiiu: 'asc' },
    take: 500,
  });
  const total = await prisma.actividadEconomica.count();

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/catalogos" className="text-sm text-slate-500 hover:text-slate-900">
          ← Catálogos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Actividades económicas (CIIU)</h1>
        <p className="mt-1 text-xs text-slate-500">
          {total} registros {total > 500 && '(mostrando los primeros 500)'}
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Crear nueva</h2>
        <CreateActividadForm />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Importar desde Excel</h2>
        <ImportForm
          action={importActividadesAction}
          headers={['codigoCiiu', 'descripcion', 'nivelRiesgo']}
          example="6202 | Programación informática | III"
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">CIIU</th>
              <th className="px-4 py-2">Descripción</th>
              <th className="px-4 py-2">Riesgo</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {actividades.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay actividades — importa desde Excel
                </td>
              </tr>
            )}
            {actividades.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-mono text-xs">{a.codigoCiiu}</td>
                <td className="px-4 py-3">{a.descripcion}</td>
                <td className="px-4 py-3 text-xs font-mono">{a.nivelRiesgo ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {a.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleActividadAction.bind(null, a.id)}>
                    <button
                      type="submit"
                      className="text-xs font-medium text-slate-500 hover:text-slate-900"
                    >
                      {a.active ? 'Desactivar' : 'Activar'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
