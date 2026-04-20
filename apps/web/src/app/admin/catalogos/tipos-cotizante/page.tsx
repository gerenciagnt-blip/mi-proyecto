import Link from 'next/link';
import { prisma } from '@pila/db';
import { CreateTipoForm } from './create-form';
import { toggleTipoAction, importTiposAction } from './actions';
import { ImportForm } from '../_components/import-form';

export const metadata = { title: 'Tipos de cotizante — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function TiposCotizantePage() {
  const tipos = await prisma.tipoCotizante.findMany({
    orderBy: { codigo: 'asc' },
    include: { _count: { select: { subtipos: true } } },
  });

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/catalogos" className="text-sm text-slate-500 hover:text-slate-900">
          ← Catálogos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Tipos de cotizante</h1>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Crear nuevo</h2>
        <CreateTipoForm />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Importar desde Excel</h2>
        <ImportForm
          action={importTiposAction}
          headers={['codigo', 'nombre']}
          example="01 | Dependiente"
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Subtipos</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tipos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay tipos de cotizante
                </td>
              </tr>
            )}
            {tipos.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 font-mono text-xs">{t.codigo}</td>
                <td className="px-4 py-3">{t.nombre}</td>
                <td className="px-4 py-3 text-slate-500">{t._count.subtipos}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {t.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/catalogos/tipos-cotizante/${t.id}`}
                      className="text-xs font-medium text-slate-700 hover:text-slate-900"
                    >
                      Subtipos
                    </Link>
                    <form action={toggleTipoAction.bind(null, t.id)}>
                      <button
                        type="submit"
                        className="text-xs font-medium text-slate-500 hover:text-slate-900"
                      >
                        {t.active ? 'Desactivar' : 'Activar'}
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
