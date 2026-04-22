import Link from 'next/link';
import { Search } from 'lucide-react';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { CreateCuentaCobroDialog } from './create-dialog';
import { toggleCuentaCobroAction } from './actions';

export const metadata = { title: 'Empresas CC — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = { q?: string; sucursalId?: string; estado?: string };

function buildHref(patch: Partial<SP>, current: SP) {
  const params = new URLSearchParams();
  const merged = { ...current, ...patch };
  if (merged.q) params.set('q', merged.q);
  if (merged.sucursalId) params.set('sucursalId', merged.sucursalId);
  if (merged.estado) params.set('estado', merged.estado);
  const s = params.toString();
  return `/admin/cuentas-cobro${s ? '?' + s : ''}`;
}

export default async function EmpresasCCPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const sucursalFilter = sp.sucursalId?.trim() ?? '';
  const estadoFilter = sp.estado === 'ACTIVA' || sp.estado === 'INACTIVA' ? sp.estado : undefined;

  const where: Prisma.CuentaCobroWhereInput = {};
  if (sucursalFilter) where.sucursalId = sucursalFilter;
  if (estadoFilter) where.active = estadoFilter === 'ACTIVA';
  if (q) {
    where.OR = [
      { razonSocial: { contains: q, mode: 'insensitive' } },
      { nit: { contains: q } },
      { codigo: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [cuentas, activasCount, inactivasCount, sucursales] = await Promise.all([
    prisma.cuentaCobro.findMany({
      where,
      orderBy: [{ sucursal: { codigo: 'asc' } }, { codigo: 'asc' }],
      include: { sucursal: { select: { codigo: true, nombre: true } } },
    }),
    prisma.cuentaCobro.count({ where: { active: true } }),
    prisma.cuentaCobro.count({ where: { active: false } }),
    prisma.sucursal.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
  ]);

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
            Empresas CC
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cuentas de cobro — agrupadores de cotizantes para facturación masiva.
          </p>
        </div>
        <CreateCuentaCobroDialog sucursales={sucursales} />
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1">
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

            <form method="GET" action="/admin/cuentas-cobro" className="flex flex-wrap items-center gap-2">
              {estadoFilter && <input type="hidden" name="estado" value={estadoFilter} />}
              <select
                name="sucursalId"
                defaultValue={sucursalFilter}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">— Todas las sucursales —</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.codigo}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Razón social, NIT o código..."
                  className="h-9 w-full min-w-[240px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
                />
              </div>
              <button
                type="submit"
                className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-blue-dark"
              >
                Buscar
              </button>
              {(q || sucursalFilter) && (
                <Link
                  href={buildHref({ q: undefined, sucursalId: undefined }, sp)}
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
              <th className="px-4 py-2">Sucursal</th>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Razón social</th>
              <th className="px-4 py-2">NIT</th>
              <th className="px-4 py-2">Ciudad</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cuentas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {q || sucursalFilter || estadoFilter
                    ? 'Sin resultados con los filtros actuales'
                    : 'Aún no hay Empresas CC — crea la primera con el botón de arriba.'}
                </td>
              </tr>
            )}
            {cuentas.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.sucursal.codigo}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.codigo}</td>
                <td className="px-4 py-3">{c.razonSocial}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {c.nit ? `${c.nit}${c.dv ? '-' + c.dv : ''}` : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{c.ciudad ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                      c.active
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-red-50 text-red-700 ring-red-200',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        c.active ? 'bg-emerald-500' : 'bg-red-500',
                      )}
                    />
                    {c.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleCuentaCobroAction.bind(null, c.id)}>
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
