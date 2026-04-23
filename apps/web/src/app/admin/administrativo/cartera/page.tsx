import { Wallet, Clock3, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Prisma, CarteraEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { formatCOP } from '@/lib/format';
import { getUserScope } from '@/lib/sucursal-scope';
import { GestionarAliadoButton } from './gestion-dialog';

export const metadata = { title: 'Cartera · Administrativo — Sistema PILA' };
export const dynamic = 'force-dynamic';

const ESTADO_LABEL: Record<CarteraEstado, string> = {
  EN_CONCILIACION: 'En conciliación',
  CONCILIADA: 'Conciliada',
  CARTERA_REAL: 'Cartera real',
  PAGADA_CARTERA_REAL: 'Pagada',
};

const ESTADO_TONE: Record<CarteraEstado, string> = {
  EN_CONCILIACION: 'bg-amber-50 text-amber-700 ring-amber-200',
  CONCILIADA: 'bg-sky-50 text-sky-700 ring-sky-200',
  CARTERA_REAL: 'bg-violet-50 text-violet-700 ring-violet-200',
  PAGADA_CARTERA_REAL: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

type SP = { estado?: string; q?: string };

export default async function AdministrativoCarteraPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const estadoFilter =
    sp.estado === 'CARTERA_REAL' || sp.estado === 'PAGADA_CARTERA_REAL'
      ? (sp.estado as CarteraEstado)
      : undefined;
  const q = sp.q?.trim() ?? '';

  // Scope: sólo líneas asignadas a la sucursal del aliado. STAFF ve todo
  // pero en general el Administrativo lo opera el aliado; dejamos el scope
  // abierto para staff por si quieren revisar.
  const scope = await getUserScope();
  const scopeWhere: Prisma.CarteraDetalladoWhereInput =
    scope?.tipo === 'SUCURSAL'
      ? { sucursalAsignadaId: scope.sucursalId }
      : {};

  // El módulo Administrativo SÓLO muestra líneas confirmadas como cartera real.
  const whereBase: Prisma.CarteraDetalladoWhereInput = {
    ...scopeWhere,
    estado: estadoFilter
      ? estadoFilter
      : { in: ['CARTERA_REAL', 'PAGADA_CARTERA_REAL'] },
  };

  if (q) {
    whereBase.OR = [
      { numeroDocumento: { contains: q, mode: 'insensitive' } },
      { nombreCompleto: { contains: q, mode: 'insensitive' } },
      { consolidado: { entidadNombre: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [lineas, carteraRealStats, pagadaStats] = await Promise.all([
    prisma.carteraDetallado.findMany({
      where: whereBase,
      orderBy: [{ consolidado: { fechaRegistro: 'desc' } }, { periodoCobro: 'desc' }],
      take: 500,
      include: {
        consolidado: {
          select: {
            id: true,
            consecutivo: true,
            entidadNombre: true,
            tipoEntidad: true,
            empresaNit: true,
            empresaRazonSocial: true,
            fechaRegistro: true,
          },
        },
        _count: { select: { gestiones: true } },
      },
    }),
    prisma.carteraDetallado.aggregate({
      where: { ...scopeWhere, estado: 'CARTERA_REAL' },
      _count: { _all: true },
      _sum: { valorCobro: true },
    }),
    prisma.carteraDetallado.aggregate({
      where: { ...scopeWhere, estado: 'PAGADA_CARTERA_REAL' },
      _count: { _all: true },
      _sum: { valorCobro: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <Wallet className="h-6 w-6 text-brand-blue" />
          Cartera
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Líneas de cartera real confirmadas por Soporte para tu sucursal.
          Registra el pago o una nota; Soporte lo verá en su consolidado.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
            <AlertCircle className="h-4 w-4" />
          </div>
          <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Cartera real pendiente
          </p>
          <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-slate-900">
            {carteraRealStats._count._all}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">
            {formatCOP(Number(carteraRealStats._sum.valorCobro ?? 0))}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Pagadas
          </p>
          <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-slate-900">
            {pagadaStats._count._all}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">
            {formatCOP(Number(pagadaStats._sum.valorCobro ?? 0))}
          </p>
        </div>
      </section>

      {/* Filtros + buscador */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form method="GET" action="/admin/administrativo/cartera" className="flex flex-wrap items-center gap-2">
            <select
              name="estado"
              defaultValue={estadoFilter ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Todas (real + pagadas)</option>
              <option value="CARTERA_REAL">Solo cartera real</option>
              <option value="PAGADA_CARTERA_REAL">Solo pagadas</option>
            </select>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar por documento, nombre o entidad…"
              className="h-9 min-w-[240px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400"
            />
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-blue-dark"
            >
              Buscar
            </button>
            <span className="ml-auto text-xs text-slate-500">
              {lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'}
            </span>
          </form>
        </div>

        {lineas.length === 0 ? (
          <Alert variant="info" className="m-5">
            <Clock3 className="h-4 w-4 shrink-0" />
            <span>
              No hay líneas de cartera real en este momento. Cuando Soporte
              marque una deuda como <strong>Cartera real</strong> aparecerá aquí.
            </span>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">Consolidado</th>
                  <th className="px-4 py-2">Entidad</th>
                  <th className="px-4 py-2">Documento</th>
                  <th className="px-4 py-2">Nombre</th>
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineas.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2 font-mono text-[11px] text-slate-500">
                      {l.consolidado.consecutivo}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <p className="font-medium">{l.consolidado.entidadNombre}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">
                        {l.consolidado.tipoEntidad}
                      </p>
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px]">
                      {l.tipoDocumento} {l.numeroDocumento}
                    </td>
                    <td className="px-4 py-2 text-xs">{l.nombreCompleto}</td>
                    <td className="px-4 py-2 font-mono text-[11px] text-slate-500">
                      {l.periodoCobro}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-semibold text-brand-blue-dark">
                      {formatCOP(Number(l.valorCobro))}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          ESTADO_TONE[l.estado],
                        )}
                      >
                        {ESTADO_LABEL[l.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <GestionarAliadoButton
                        detalladoId={l.id}
                        estadoActual={l.estado}
                        cotizante={{
                          tipo: l.tipoDocumento,
                          numero: l.numeroDocumento,
                          nombre: l.nombreCompleto,
                        }}
                        periodo={l.periodoCobro}
                        valor={Number(l.valorCobro)}
                        gestionesCount={l._count.gestiones}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
