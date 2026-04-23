import Link from 'next/link';
import {
  Wallet,
  AlertCircle,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { CarteraEstado, CarteraTipoEntidad, Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { formatCOP } from '@/lib/format';
import { UploadCarteraButton } from './upload-dialog';

export const metadata = { title: 'Cartera · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

const TIPO_LABEL: Record<CarteraTipoEntidad, string> = {
  EPS: 'EPS',
  AFP: 'AFP',
  ARL: 'ARL',
  CCF: 'CCF',
};

const ESTADO_LABEL: Record<CarteraEstado, string> = {
  EN_CONCILIACION: 'En conciliación',
  CONCILIADA: 'Conciliada',
  CARTERA_REAL: 'Cartera real',
  PAGADA_CARTERA_REAL: 'Pagada (cartera real)',
};

/** Parse YYYY-MM-DD seguro; undefined si inválido. */
function parseDateIso(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0));
}

type SP = {
  desde?: string;
  hasta?: string;
  tipo?: string;
  entidad?: string;
};

export default async function SoporteCarteraPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const desde = parseDateIso(sp.desde);
  const hasta = parseDateIso(sp.hasta);
  const tipoFilter =
    sp.tipo === 'EPS' || sp.tipo === 'AFP' || sp.tipo === 'ARL' || sp.tipo === 'CCF'
      ? (sp.tipo as CarteraTipoEntidad)
      : undefined;
  const entidadQ = sp.entidad?.trim() ?? '';

  const where: Prisma.CarteraConsolidadoWhereInput = {};
  if (desde || hasta) {
    where.fechaRegistro = {};
    if (desde) where.fechaRegistro.gte = desde;
    if (hasta) {
      // Incluimos el día "hasta" completo (< siguiente día).
      const next = new Date(hasta);
      next.setUTCDate(next.getUTCDate() + 1);
      where.fechaRegistro.lt = next;
    }
  }
  if (tipoFilter) where.tipoEntidad = tipoFilter;
  if (entidadQ) {
    where.OR = [
      { entidadNombre: { contains: entidadQ, mode: 'insensitive' } },
      { empresaNit: { contains: entidadQ } },
      { empresaRazonSocial: { contains: entidadQ, mode: 'insensitive' } },
      { consecutivo: { contains: entidadQ, mode: 'insensitive' } },
    ];
  }

  const [lineasAgrupado, consolidados] = await Promise.all([
    prisma.carteraDetallado.groupBy({
      by: ['estado'],
      _count: { _all: true },
      _sum: { valorCobro: true },
    }),
    prisma.carteraConsolidado.findMany({
      where,
      orderBy: { fechaRegistro: 'desc' },
      take: 200,
      include: {
        empresa: { select: { id: true, nombre: true } },
        _count: { select: { detallado: true } },
      },
    }),
  ]);

  const statsByEstado = new Map<
    CarteraEstado,
    { count: number; total: number }
  >();
  for (const r of lineasAgrupado) {
    statsByEstado.set(r.estado, {
      count: r._count._all,
      total: Number(r._sum.valorCobro ?? 0),
    });
  }

  const stats: Array<{
    estado: CarteraEstado;
    label: string;
    icon: typeof Clock;
    tone: 'amber' | 'sky' | 'emerald' | 'violet';
    count: number;
    total: number;
  }> = [
    {
      estado: 'EN_CONCILIACION',
      label: 'En conciliación',
      icon: Clock,
      tone: 'amber',
      count: statsByEstado.get('EN_CONCILIACION')?.count ?? 0,
      total: statsByEstado.get('EN_CONCILIACION')?.total ?? 0,
    },
    {
      estado: 'CONCILIADA',
      label: 'Conciliadas',
      icon: CheckCircle2,
      tone: 'sky',
      count: statsByEstado.get('CONCILIADA')?.count ?? 0,
      total: statsByEstado.get('CONCILIADA')?.total ?? 0,
    },
    {
      estado: 'CARTERA_REAL',
      label: 'Cartera real',
      icon: AlertCircle,
      tone: 'violet',
      count: statsByEstado.get('CARTERA_REAL')?.count ?? 0,
      total: statsByEstado.get('CARTERA_REAL')?.total ?? 0,
    },
    {
      estado: 'PAGADA_CARTERA_REAL',
      label: 'Pagada cartera real',
      icon: CheckCircle2,
      tone: 'emerald',
      count: statsByEstado.get('PAGADA_CARTERA_REAL')?.count ?? 0,
      total: statsByEstado.get('PAGADA_CARTERA_REAL')?.total ?? 0,
    },
  ];

  const hayFiltros =
    !!desde || !!hasta || !!tipoFilter || entidadQ.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <Wallet className="h-6 w-6 text-brand-blue" />
            Cartera · Soporte
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Importa estados de cuenta de entidades SGSS y gestiónalos. Las
            líneas que marques como <span className="font-medium">Cartera real</span>
            {' '}aparecerán automáticamente en el módulo Administrativo del
            aliado dueño de la sucursal.
          </p>
        </div>
        <UploadCarteraButton />
      </header>

      {/* Stats por estado (agregados a nivel línea) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.estado}
            className={cn('rounded-xl border bg-white p-4 shadow-sm', {
              'border-amber-200': s.tone === 'amber',
              'border-sky-200': s.tone === 'sky',
              'border-emerald-200': s.tone === 'emerald',
              'border-violet-200': s.tone === 'violet',
            })}
          >
            <div
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-lg',
                {
                  'bg-amber-50 text-amber-700': s.tone === 'amber',
                  'bg-sky-50 text-sky-700': s.tone === 'sky',
                  'bg-emerald-50 text-emerald-700': s.tone === 'emerald',
                  'bg-violet-50 text-violet-700': s.tone === 'violet',
                },
              )}
            >
              <s.icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {s.label}
            </p>
            <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-slate-900">
              {s.count}
            </p>
            <p className="mt-0.5 font-mono text-xs text-slate-500">
              {formatCOP(s.total)}
            </p>
          </div>
        ))}
      </section>

      {/* Lista de consolidados */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <form
            method="GET"
            action="/admin/soporte/cartera"
            className="flex flex-wrap items-end gap-2"
          >
            <div>
              <label
                htmlFor="desde"
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500"
              >
                Desde
              </label>
              <input
                type="date"
                id="desde"
                name="desde"
                defaultValue={sp.desde ?? ''}
                className="mt-0.5 h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="hasta"
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500"
              >
                Hasta
              </label>
              <input
                type="date"
                id="hasta"
                name="hasta"
                defaultValue={sp.hasta ?? ''}
                className="mt-0.5 h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="tipo"
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500"
              >
                Tipo
              </label>
              <select
                id="tipo"
                name="tipo"
                defaultValue={tipoFilter ?? ''}
                className="mt-0.5 h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="EPS">EPS</option>
                <option value="AFP">AFP</option>
                <option value="ARL">ARL</option>
                <option value="CCF">CCF</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label
                htmlFor="entidad"
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500"
              >
                Entidad / NIT / consecutivo
              </label>
              <input
                type="search"
                id="entidad"
                name="entidad"
                defaultValue={entidadQ}
                placeholder="Salud Total · 901913106 · CC-000001…"
                className="mt-0.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-blue-dark"
            >
              Filtrar
            </button>
            {hayFiltros && (
              <Link
                href="/admin/soporte/cartera"
                className="h-9 leading-9 text-xs text-slate-500 hover:text-slate-900"
              >
                Limpiar
              </Link>
            )}
            <span className="ml-auto self-end text-xs text-slate-500">
              {consolidados.length}{' '}
              {consolidados.length === 1 ? 'consolidado' : 'consolidados'}
            </span>
          </form>
        </header>
        {consolidados.length === 0 ? (
          <Alert variant="info" className="m-5">
            <FileText className="h-4 w-4 shrink-0" />
            <span>
              {hayFiltros
                ? 'Sin resultados con los filtros actuales.'
                : 'No hay estados de cuenta cargados todavía. Usa el botón “Cargar estado de cuenta” para importar el primer PDF.'}
            </span>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">Consecutivo</th>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Entidad</th>
                  <th className="px-4 py-2">Empresa (NIT)</th>
                  <th className="px-4 py-2 text-right">Líneas</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {consolidados.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold">
                      <Link
                        href={`/admin/soporte/cartera/${c.id}`}
                        className="text-brand-blue hover:underline"
                      >
                        {c.consecutivo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {c.fechaRegistro.toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <p className="font-medium">{c.entidadNombre}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">
                        {TIPO_LABEL[c.tipoEntidad]}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <p className="font-medium">
                        {c.empresa?.nombre ?? c.empresaRazonSocial}
                      </p>
                      <p className="font-mono text-[10px] text-slate-500">
                        NIT {c.empresaNit}
                        {!c.empresa && (
                          <span
                            className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700"
                            title="El NIT del PDF no corresponde a ninguna empresa registrada en el módulo Empresas. Se muestra la razón social tal como viene del PDF."
                          >
                            NIT no registrado
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {c._count.detallado}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-brand-blue-dark">
                      {formatCOP(Number(c.valorTotalInformado))}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          c.estado === 'EN_CONCILIACION' &&
                            'bg-amber-50 text-amber-700 ring-amber-200',
                          c.estado === 'CONCILIADA' &&
                            'bg-sky-50 text-sky-700 ring-sky-200',
                          c.estado === 'CARTERA_REAL' &&
                            'bg-violet-50 text-violet-700 ring-violet-200',
                          c.estado === 'PAGADA_CARTERA_REAL' &&
                            'bg-emerald-50 text-emerald-700 ring-emerald-200',
                        )}
                      >
                        {ESTADO_LABEL[c.estado]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Leyenda de flujo */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="mb-2 flex items-center gap-1 font-semibold text-slate-700">
          <XCircle className="h-3.5 w-3.5" />
          Flujo de estados
        </p>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <li><strong>En conciliación</strong>: recién importado — revísalo.</li>
          <li><strong>Conciliada</strong>: respondiste a la entidad o descartaste la deuda.</li>
          <li><strong>Cartera real</strong>: deuda confirmada — aparece en el aliado.</li>
          <li><strong>Pagada cartera real</strong>: el aliado pagó.</li>
        </ul>
      </section>
    </div>
  );
}
