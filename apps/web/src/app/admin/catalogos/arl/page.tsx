import Link from 'next/link';
import { prisma } from '@pila/db';
import { CreateArlForm } from './create-form';
import { toggleArlAction, importArlAction } from './actions';
import { ImportForm } from '../_components/import-form';

export const metadata = { title: 'ARLs — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function ArlPage() {
  const arls = await prisma.arl.findMany({ orderBy: { codigo: 'asc' } });

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/catalogos" className="text-sm text-slate-500 hover:text-slate-900">
          ← Catálogos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">ARLs</h1>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Crear nueva</h2>
        <CreateArlForm />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Importar desde Excel</h2>
        <ImportForm action={importArlAction} headers={['codigo', 'nombre']} example="COLP | Colpatria" />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {arls.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay ARLs
                </td>
              </tr>
            )}
            {arls.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-mono text-xs">{a.codigo}</td>
                <td className="px-4 py-3">{a.nombre}</td>
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
                  <form action={toggleArlAction.bind(null, a.id)}>
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
