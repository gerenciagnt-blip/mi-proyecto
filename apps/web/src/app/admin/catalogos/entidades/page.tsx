import Link from 'next/link';
import { prisma } from '@pila/db';
import type { TipoEntidadSgss } from '@pila/db';
import { TipoEntidadSgssEnum } from '@/lib/validations';
import { EntidadTabs } from './tabs';
import { CreateEntidadForm } from './create-form';
import { toggleEntidadAction, importEntidadesAction } from './actions';
import { ImportForm } from '../_components/import-form';
import { EditCodigoAxaRow } from './edit-codigo-axa-row';

export const metadata = { title: 'Entidades SGSS — Sistema PILA' };
export const dynamic = 'force-dynamic';

const TIPO_LABELS: Record<TipoEntidadSgss, string> = {
  EPS: 'EPS',
  AFP: 'AFP',
  ARL: 'ARL',
  CCF: 'Caja de Compensación',
};

export default async function EntidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const sp = await searchParams;
  const parsedTipo = TipoEntidadSgssEnum.safeParse(sp.tipo ?? 'ARL');
  const tipo: TipoEntidadSgss = parsedTipo.success ? (parsedTipo.data as TipoEntidadSgss) : 'ARL';

  const entidades = await prisma.entidadSgss.findMany({
    where: { tipo },
    orderBy: { codigo: 'asc' },
  });

  // Sprint 8.5: el `codigoAxa` solo aplica a EPS y AFP (las únicas
  // entidades que el bot Colpatria llena en el form de Ingreso
  // Individual). Para ARL y CCF, ocultamos la columna.
  const muestraCodigoAxa = tipo === 'EPS' || tipo === 'AFP';

  const importAction = importEntidadesAction.bind(null, tipo);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/catalogos" className="text-sm text-slate-500 hover:text-slate-900">
          ← Catálogos
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Entidades SGSS
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Catálogo unificado de EPS, AFP, ARL y Cajas de Compensación.
        </p>
      </header>

      <EntidadTabs current={tipo} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Crear {TIPO_LABELS[tipo]}</h2>
        <CreateEntidadForm tipo={tipo} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Importar desde Excel</h2>
        <ImportForm
          action={importAction}
          headers={['codigo', 'nombre', 'codigoMinSalud', 'nit', 'codigoAxa']}
          example="EPS001 | Nueva EPS | EPS037 | 860066942-7 | 1"
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Cód. MinSalud</th>
              <th className="px-4 py-2">NIT</th>
              {muestraCodigoAxa && (
                <th
                  className="px-4 py-2"
                  title="Código del catálogo AXA Colpatria — usado por el bot RPA"
                >
                  Cód. AXA
                </th>
              )}
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entidades.length === 0 && (
              <tr>
                <td
                  colSpan={muestraCodigoAxa ? 7 : 6}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  Aún no hay {TIPO_LABELS[tipo]}
                </td>
              </tr>
            )}
            {entidades.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-mono text-xs">{e.codigo}</td>
                <td className="px-4 py-3">{e.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {e.codigoMinSalud ?? '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{e.nit ?? '—'}</td>
                {muestraCodigoAxa && (
                  <td className="px-4 py-3">
                    <EditCodigoAxaRow
                      id={e.id}
                      nombre={e.nombre}
                      codigoMinSalud={e.codigoMinSalud}
                      nit={e.nit}
                      codigoAxaInicial={e.codigoAxa}
                    />
                  </td>
                )}
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
                  <form action={toggleEntidadAction.bind(null, e.id)}>
                    <button
                      type="submit"
                      className="text-xs font-medium text-slate-500 hover:text-slate-900"
                    >
                      {e.active ? 'Desactivar' : 'Activar'}
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
