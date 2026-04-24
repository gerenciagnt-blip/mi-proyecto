import Link from 'next/link';
import { ArrowLeft, DollarSign, AlertCircle, AlertTriangle } from 'lucide-react';
import type { CobroAliadoEstado, Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { formatCOP } from '@/lib/format';

export const metadata = { title: 'Cobro Aliados · Finanzas — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = {
  estado?: string;
  sucursalId?: string;
  periodoId?: string;
};

const ESTADO_LABEL: Record<CobroAliadoEstado, string> = {
  PENDIENTE: 'Pendiente',
  PAGADO: 'Pagado',
  VENCIDO: 'Vencido',
  ANULADO: 'Anulado',
};
const ESTADO_TONE: Record<CobroAliadoEstado, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 ring-amber-200',
  PAGADO: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  VENCIDO: 'bg-red-50 text-red-700 ring-red-200',
  ANULADO: 'bg-slate-100 text-slate-600 ring-slate-200',
};

function mesLabel(a: number, m: number): string {
  const meses = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic',
  ];
  return `${meses[m - 1]} ${a}`;
}

export default async function CobroAliadosPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;

  const estadoFilter: CobroAliadoEstado | undefined =
    sp.estado === 'PENDIENTE' ||
    sp.estado === 'PAGADO' ||
    sp.estado === 'VENCIDO' ||
    sp.estado === 'ANULADO'
      ? (sp.estado as CobroAliadoEstado)
      : undefined;
  const sucursalFilter = sp.sucursalId?.trim() ?? '';
  const periodoFilter = sp.periodoId?.trim() ?? '';

  const where: Prisma.CobroAliadoWhereInput = {};
  if (estadoFilter) where.estado = estadoFilter;
  if (sucursalFilter) where.sucursalId = sucursalFilter;
  if (periodoFilter) where.periodoId = periodoFilter;

  const [cobros, statsByEstado, sucursales, periodos] = await Promise.all([
    prisma.cobroAliado.findMany({
      where,
      orderBy: [{ fechaGenerado: 'desc' }],
      take: 300,
      include: {
        sucursal: { select: { codigo: true, nombre: true } },
        periodo: { select: { anio: true, mes: true } },
        _count: { select: { conceptos: true } },
      },
    }),
    prisma.cobroAliado.groupBy({
      by: ['estado'],
      _count: { _all: true },
      _sum: { totalCobro: true },
    }),
    prisma.sucursal.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
    prisma.periodoContable.findMany({
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: 12,
      select: { id: true, anio: true, mes: true },
    }),
  ]);

  const counts = new Map<CobroAliadoEstado, { n: number; total: number }>();
  for (const r of statsByEstado) {
    counts.set(r.estado, {
      n: r._count._all,
      total: r._sum.totalCobro ? Number(r._sum.totalCobro) : 0,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/soporte/finanzas"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3 w-3" /> Finanzas
        </Link>
      </div>

      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <DollarSign className="h-6 w-6 text-brand-blue" />
          Cobro Aliados
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cobros mensuales a los aliados por afiliaciones procesadas y mensualidades facturadas.
        </p>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(ESTADO_LABEL) as CobroAliadoEstado[]).map((e) => {
          const c = counts.get(e);
          return (
            <div
              key={e}
              className={cn(
                'rounded-xl border bg-white p-3 shadow-sm',
                e === 'PENDIENTE' && 'border-amber-200',
                e === 'PAGADO' && 'border-emerald-200',
                e === 'VENCIDO' && 'border-red-200',
                e === 'ANULADO' && 'border-slate-200',
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                {ESTADO_LABEL[e]}
              </p>
              <p className="mt-1 font-mono text-xl font-bold tracking-tight text-slate-900">
                {c?.n ?? 0}
              </p>
              {c && c.total > 0 && (
                <p className="mt-0.5 font-mono text-[10px] text-slate-500">{formatCOP(c.total)}</p>
              )}
            </div>
          );
        })}
      </section>

      {/* Filtros + Tabla */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form
            method="GET"
            action="/admin/soporte/finanzas/cobro-aliados"
            className="flex flex-wrap items-end gap-2 text-xs"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Estado</span>
              <select
                name="estado"
                defaultValue={estadoFilter ?? ''}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">Todos</option>
                {(Object.keys(ESTADO_LABEL) as CobroAliadoEstado[]).map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_LABEL[e]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Sucursal</span>
              <select
                name="sucursalId"
                defaultValue={sucursalFilter}
                className="h-9 min-w-[180px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">Todas</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.codigo} · {s.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Período</span>
              <select
                name="periodoId"
                defaultValue={periodoFilter}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">Todos</option>
                {periodos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {mesLabel(p.anio, p.mes)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-xs font-medium text-white hover:bg-brand-blue-dark"
            >
              Aplicar
            </button>
            {(estadoFilter || sucursalFilter || periodoFilter) && (
              <Link
                href="/admin/soporte/finanzas/cobro-aliados"
                className="h-9 leading-9 text-xs text-slate-500 underline"
              >
                Limpiar
              </Link>
            )}
            <span className="ml-auto self-center text-xs text-slate-500">
              {cobros.length} resultados
            </span>
          </form>
        </div>

        {cobros.length === 0 ? (
          <Alert variant="info" className="m-5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Sin cobros con los filtros actuales. Al cerrar el mes, el generador creará un cobro
              por sucursal con tarifas configuradas.
            </span>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">Consecutivo</th>
                  <th className="px-4 py-2">Sucursal</th>
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2 text-right">Afiliaciones</th>
                  <th className="px-4 py-2 text-right">Mensualidades</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Fecha límite</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cobros.map((c) => {
                  const vencido = c.estado === 'PENDIENTE' && c.fechaLimite < new Date();
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs font-semibold">
                        <Link
                          href={`/admin/soporte/finanzas/cobro-aliados/${c.id}`}
                          className="text-brand-blue hover:underline"
                        >
                          {c.consecutivo}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <p className="font-medium">{c.sucursal.codigo}</p>
                        <p className="text-[10px] text-slate-500">{c.sucursal.nombre}</p>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {mesLabel(c.periodo.anio, c.periodo.mes)}
                      </td>
                      <td className="px-4 py-2 text-right text-xs">
                        <span className="font-mono">{c.cantAfiliaciones}</span>
                        <span className="ml-1 text-[10px] text-slate-400">
                          ({formatCOP(Number(c.valorAfiliaciones))})
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs">
                        <span className="font-mono">{c.cantMensualidades}</span>
                        <span className="ml-1 text-[10px] text-slate-400">
                          ({formatCOP(Number(c.valorMensualidades))})
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-sm font-semibold">
                        {formatCOP(Number(c.totalCobro))}
                      </td>
                      <td className="px-4 py-2 text-[11px]">
                        <span className={cn(vencido && 'font-semibold text-red-700')}>
                          {c.fechaLimite.toLocaleDateString('es-CO')}
                        </span>
                        {vencido && <AlertTriangle className="ml-1 inline h-3 w-3 text-red-600" />}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                            ESTADO_TONE[c.estado],
                          )}
                        >
                          {ESTADO_LABEL[c.estado]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
