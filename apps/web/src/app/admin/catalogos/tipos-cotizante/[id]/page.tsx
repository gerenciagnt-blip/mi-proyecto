import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@pila/db';
import { CreateSubtipoForm } from './subtipo-create-form';
import { toggleSubtipoAction, importSubtiposAction } from './actions';
import { ImportForm } from '../../_components/import-form';

export const metadata = { title: 'Subtipos — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function TipoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tipo = await prisma.tipoCotizante.findUnique({
    where: { id },
    include: {
      subtipos: { orderBy: { codigo: 'asc' } },
    },
  });
  if (!tipo) notFound();

  const importAction = importSubtiposAction.bind(null, id);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/catalogos/tipos-cotizante"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Tipos de cotizante
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          <span className="font-mono text-lg text-slate-500">{tipo.codigo}</span>{' '}
          <span>{tipo.nombre}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">{tipo.subtipos.length} subtipos</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Crear subtipo</h2>
        <CreateSubtipoForm tipoCotizanteId={tipo.id} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Importar subtipos desde Excel</h2>
        <p className="mb-2 text-xs text-slate-500">
          Solo subtipos para <strong>{tipo.codigo} — {tipo.nombre}</strong>.
        </p>
        <ImportForm
          action={importAction}
          headers={['codigo', 'nombre']}
          example="00 | Planta permanente"
        />
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
            {tipo.subtipos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay subtipos
                </td>
              </tr>
            )}
            {tipo.subtipos.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-mono text-xs">{s.codigo}</td>
                <td className="px-4 py-3">{s.nombre}</td>
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
                  <form action={toggleSubtipoAction.bind(null, tipo.id, s.id)}>
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
