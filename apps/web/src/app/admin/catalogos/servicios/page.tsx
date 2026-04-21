import Link from 'next/link';
import { prisma } from '@pila/db';
import { CreateServicioForm } from './create-form';
import { toggleServicioAction } from './actions';

export const metadata = { title: 'Servicios adicionales — Sistema PILA' };
export const dynamic = 'force-dynamic';

const copFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default async function ServiciosPage() {
  const servicios = await prisma.servicioAdicional.findMany({ orderBy: { codigo: 'asc' } });

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/catalogos" className="text-sm text-slate-500 hover:text-slate-900">
          ← Catálogos
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Servicios adicionales
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cobros extra sobre el servicio base — asignables al crear cotizante.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Crear nuevo servicio</h2>
        <CreateServicioForm />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Precio</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {servicios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay servicios adicionales
                </td>
              </tr>
            )}
            {servicios.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-mono text-xs">{s.codigo}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{s.nombre}</p>
                  {s.descripcion && <p className="text-[11px] text-slate-500">{s.descripcion}</p>}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{copFmt.format(Number(s.precio))}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {s.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleServicioAction.bind(null, s.id)}>
                    <button
                      type="submit"
                      className="text-xs font-medium text-slate-500 hover:text-slate-900"
                    >
                      {s.active ? 'Desactivar' : 'Activar'}
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
