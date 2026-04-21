import Link from 'next/link';
import { ArrowLeft, Check, Minus } from 'lucide-react';
import { prisma } from '@pila/db';
import { CreatePlanForm } from './create-form';
import { togglePlanAction } from './actions';

export const metadata = { title: 'Planes SGSS — Sistema PILA' };
export const dynamic = 'force-dynamic';

function Flag({ on }: { on: boolean }) {
  return on ? (
    <Check className="h-4 w-4 text-emerald-600" />
  ) : (
    <Minus className="h-4 w-4 text-slate-300" />
  );
}

export default async function PlanesPage() {
  const planes = await prisma.planSgss.findMany({
    orderBy: [{ active: 'desc' }, { codigo: 'asc' }],
  });

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/catalogos"
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Catálogos</span>
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Planes SGSS
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Define combinaciones de entidades (EPS, AFP, ARL, CCF). El plan determina qué campos de
          entidades son requeridos en la afiliación.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Crear nuevo plan</h2>
        <CreatePlanForm />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2 text-center">EPS</th>
              <th className="px-4 py-2 text-center">AFP</th>
              <th className="px-4 py-2 text-center">ARL</th>
              <th className="px-4 py-2 text-center">CCF</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {planes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay planes
                </td>
              </tr>
            )}
            {planes.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-mono text-xs">{p.codigo}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{p.nombre}</p>
                  {p.descripcion && (
                    <p className="text-[11px] text-slate-500">{p.descripcion}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <Flag on={p.incluyeEps} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <Flag on={p.incluyeAfp} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <Flag on={p.incluyeArl} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <Flag on={p.incluyeCcf} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {p.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={togglePlanAction.bind(null, p.id)}>
                    <button
                      type="submit"
                      className="text-xs font-medium text-slate-500 hover:text-slate-900"
                    >
                      {p.active ? 'Desactivar' : 'Activar'}
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
