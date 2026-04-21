import Link from 'next/link';
import { prisma } from '@pila/db';
import { CreateAsesorForm } from './create-form';
import { toggleAsesorAction } from './actions';

export const metadata = { title: 'Asesores comerciales — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function AsesoresPage() {
  const asesores = await prisma.asesorComercial.findMany({ orderBy: { codigo: 'asc' } });

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/catalogos" className="text-sm text-slate-500 hover:text-slate-900">
          ← Catálogos
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Asesores comerciales
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Personas que generan la venta. Se anclan al cotizante al momento de crearlo.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Crear nuevo asesor</h2>
        <CreateAsesorForm />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Correo</th>
              <th className="px-4 py-2">Teléfono</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {asesores.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay asesores
                </td>
              </tr>
            )}
            {asesores.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-mono text-xs">{a.codigo}</td>
                <td className="px-4 py-3">{a.nombre}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{a.email ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{a.telefono ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {a.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleAsesorAction.bind(null, a.id)}>
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
