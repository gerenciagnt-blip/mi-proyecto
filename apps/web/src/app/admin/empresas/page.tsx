import Link from 'next/link';
import { Search } from 'lucide-react';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { CreateEmpresaDialog } from './create-dialog';
import { toggleEmpresaAction } from './actions';

export const metadata = { title: 'Empresas planilla — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = { q?: string; estado?: string };

function buildHref(patch: Partial<SP>, current: SP) {
  const params = new URLSearchParams();
  const merged = { ...current, ...patch };
  if (merged.q) params.set('q', merged.q);
  if (merged.estado) params.set('estado', merged.estado);
  const s = params.toString();
  return `/admin/empresas${s ? '?' + s : ''}`;
}

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const estadoFilter = sp.estado === 'ACTIVA' || sp.estado === 'INACTIVA' ? sp.estado : undefined;

  const where: Prisma.EmpresaWhereInput = {};
  if (estadoFilter) where.active = estadoFilter === 'ACTIVA';
  if (q) {
    where.OR = [
      { nombre: { contains: q, mode: 'insensitive' } },
      { nombreComercial: { contains: q, mode: 'insensitive' } },
      { nit: { contains: q } },
    ];
  }

  const [empresas, activasCount, inactivasCount, arls, departamentos] = await Promise.all([
    prisma.empresa.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { accesos: true } },
        arl: { select: { codigo: true } },
      },
    }),
    prisma.empresa.count({ where: { active: true } }),
    prisma.empresa.count({ where: { active: false } }),
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

  const total = activasCount + inactivasCount;
  const tabs = [
    { label: 'Todas', count: total, href: buildHref({ estado: undefined }, sp), active: !estadoFilter },
    {
      label: 'Activas',
      count: activasCount,
      href: buildHref({ estado: 'ACTIVA' }, sp),
      active: estadoFilter === 'ACTIVA',
    },
    {
      label: 'Inactivas',
      count: inactivasCount,
      href: buildHref({ estado: 'INACTIVA' }, sp),
      active: estadoFilter === 'INACTIVA',
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
            Empresas planilla
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Empresas clientes donde se liquida el PILA de los cotizantes dependientes.
          </p>
        </div>
        <CreateEmpresaDialog arls={arls} departamentos={departamentosOpts} />
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1">
              {tabs.map((t) => (
                <Link
                  key={t.label}
                  href={t.href}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition',
                    t.active
                      ? 'bg-brand-blue/10 text-brand-blue-dark'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  {t.label}{' '}
                  <span className="ml-1 text-xs text-slate-400">({t.count})</span>
                </Link>
              ))}
            </div>

            <form method="GET" action="/admin/empresas" className="flex items-center gap-2">
              {estadoFilter && <input type="hidden" name="estado" value={estadoFilter} />}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Buscar por razón social o NIT..."
                  className="h-9 w-full min-w-[260px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
                />
              </div>
              {q && (
                <Link
                  href={buildHref({ q: undefined }, sp)}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Limpiar
                </Link>
              )}
            </form>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">NIT</th>
              <th className="px-4 py-2">Razón social</th>
              <th className="px-4 py-2">ARL</th>
              <th className="px-4 py-2">Usuarios</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {empresas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {q || estadoFilter
                    ? 'Sin resultados con los filtros actuales'
                    : 'Aún no hay empresas — crea la primera con el botón de arriba.'}
                </td>
              </tr>
            )}
            {empresas.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-mono text-xs">
                  {e.nit}
                  {e.dv ? <span className="text-slate-400">-{e.dv}</span> : null}
                </td>
                <td className="px-4 py-3">
                  <p>{e.nombre}</p>
                  {e.nombreComercial && (
                    <p className="text-[11px] text-slate-500">{e.nombreComercial}</p>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {e.arl?.codigo ?? '—'}
                </td>
                <td className="px-4 py-3 text-slate-500">{e._count.accesos}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                      e.active
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-red-50 text-red-700 ring-red-200',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        e.active ? 'bg-emerald-500' : 'bg-red-500',
                      )}
                    />
                    {e.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/empresas/${e.id}`}
                      className="text-xs font-medium text-brand-blue hover:text-brand-blue-dark"
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
