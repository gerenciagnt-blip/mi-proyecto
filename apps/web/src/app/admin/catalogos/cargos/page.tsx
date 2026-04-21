import Link from 'next/link';
import { prisma } from '@pila/db';
import { CreateCargoForm } from './create-form';
import { toggleCargoAction } from './actions';

export const metadata = { title: 'Cargos — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function CargosPage() {
  const [cargos, actividades] = await Promise.all([
    prisma.cargo.findMany({
      orderBy: { codigo: 'asc' },
      include: { actividad: { select: { codigoCiiu: true, descripcion: true } } },
    }),
    prisma.actividadEconomica.findMany({
      where: { active: true },
      orderBy: { codigoCiiu: 'asc' },
      select: { id: true, codigoCiiu: true, descripcion: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/catalogos" className="text-sm text-slate-500 hover:text-slate-900">
          ← Catálogos
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Cargos
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cargos ocupacionales ligados a actividades económicas (CIIU).
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Crear nuevo cargo</h2>
        <CreateCargoForm actividades={actividades} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Actividad</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay cargos
                </td>
              </tr>
            )}
            {cargos.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-mono text-xs">{c.codigo}</td>
                <td className="px-4 py-3">{c.nombre}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {c.actividad ? (
                    <>
                      <span className="font-mono">{c.actividad.codigoCiiu}</span>
                      <span className="ml-2">{c.actividad.descripcion}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {c.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleCargoAction.bind(null, c.id)}>
                    <button
                      type="submit"
                      className="text-xs font-medium text-slate-500 hover:text-slate-900"
                    >
                      {c.active ? 'Desactivar' : 'Activar'}
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
