import Link from 'next/link';
import { ClipboardList, Plus, AlertCircle } from 'lucide-react';
import type { Prisma, ReporteATEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { ESTADO_LABEL, ESTADO_TONE } from '@/lib/reporte-at/validations';

export const metadata = { title: 'Reporte AT · Administrativo — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = { estado?: string; q?: string };

const ESTADOS_VALIDOS = ['RADICADO', 'EN_REVISION', 'CERRADO', 'ANULADO'] as const;

export default async function ReporteAtAdministrativoPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requirePermiso('admin.reporte_at');
  const sp = await searchParams;

  const estadoFilter = (ESTADOS_VALIDOS as readonly string[]).includes(sp.estado ?? '')
    ? (sp.estado as ReporteATEstado)
    : undefined;
  const q = sp.q?.trim() ?? '';

  const scope = await getUserScope();
  // SUCURSAL y ASESOR comparten filtro por sucursal — el asesor ve los
  // reportes AT de su sucursal (no se filtra por asesorComercialId
  // porque el reporte AT lo radica el aliado dueño, no el asesor).
  const scopeWhere: Prisma.ReporteAccidenteTrabajoWhereInput =
    scope?.tipo === 'SUCURSAL' || scope?.tipo === 'ASESOR' ? { sucursalId: scope.sucursalId } : {};

  const where: Prisma.ReporteAccidenteTrabajoWhereInput = { ...scopeWhere };
  if (estadoFilter) where.estado = estadoFilter;
  if (q) {
    where.OR = [
      { consecutivo: { contains: q, mode: 'insensitive' } },
      { trabajadorNumeroDoc: { contains: q, mode: 'insensitive' } },
      { trabajadorNombre: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [reportes, statsByEstado] = await Promise.all([
    prisma.reporteAccidenteTrabajo.findMany({
      where,
      orderBy: { fechaRadicacion: 'desc' },
      take: 300,
      select: {
        id: true,
        consecutivo: true,
        fechaRadicacion: true,
        fechaAccidente: true,
        trabajadorNombre: true,
        trabajadorTipoDoc: true,
        trabajadorNumeroDoc: true,
        empresaRazonSocial: true,
        estado: true,
      },
    }),
    prisma.reporteAccidenteTrabajo.groupBy({
      by: ['estado'],
      where: scopeWhere,
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<ReporteATEstado, number>();
  for (const r of statsByEstado) counts.set(r.estado, r._count._all);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <ClipboardList className="h-6 w-6 text-brand-blue" />
            Reporte AT · Administrativo
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Reporta los accidentes e incidentes de trabajo de tu sucursal. Cada radicación recibe un
            consecutivo y queda en cola para revisión de Soporte.
          </p>
        </div>
        <Link
          href="/admin/administrativo/reporte-at/nuevo"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white shadow-sm transition hover:bg-brand-blue-dark"
        >
          <Plus className="h-4 w-4" />
          Radicar reporte AT
        </Link>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(ESTADO_LABEL) as ReporteATEstado[]).map((e) => (
          <div
            key={e}
            className={cn(
              'rounded-xl border bg-white p-3 shadow-sm',
              e === 'RADICADO' && 'border-sky-200',
              e === 'EN_REVISION' && 'border-amber-200',
              e === 'CERRADO' && 'border-emerald-200',
              e === 'ANULADO' && 'border-slate-200',
            )}
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {ESTADO_LABEL[e]}
            </p>
            <p className="mt-1 font-mono text-xl font-bold tracking-tight text-slate-900">
              {counts.get(e) ?? 0}
            </p>
          </div>
        ))}
      </section>

      {/* Filtros */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form
            method="GET"
            action="/admin/administrativo/reporte-at"
            className="flex flex-wrap items-center gap-2"
          >
            <select
              name="estado"
              defaultValue={estadoFilter ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">Todos los estados</option>
              {ESTADOS_VALIDOS.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_LABEL[e as ReporteATEstado]}
                </option>
              ))}
            </select>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Consecutivo, documento o nombre…"
              className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            />
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-blue-dark"
            >
              Buscar
            </button>
            {(estadoFilter || q) && (
              <Link
                href="/admin/administrativo/reporte-at"
                className="h-9 leading-9 text-xs text-slate-500"
              >
                Limpiar
              </Link>
            )}
            <span className="ml-auto text-xs text-slate-500">{reportes.length}</span>
          </form>
        </div>

        {reportes.length === 0 ? (
          <Alert variant="info" className="m-5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Sin reportes con los filtros actuales. Usa el botón “Radicar reporte AT” para crear
              uno nuevo.
            </span>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">Consecutivo</th>
                  <th className="px-4 py-2">Radicado</th>
                  <th className="px-4 py-2">Fecha accidente</th>
                  <th className="px-4 py-2">Trabajador</th>
                  <th className="px-4 py-2">Empresa</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportes.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs font-semibold">
                      <Link
                        href={`/admin/administrativo/reporte-at/${r.id}`}
                        className="text-brand-blue hover:underline"
                      >
                        {r.consecutivo}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-[11px] text-slate-500">
                      {r.fechaRadicacion.toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-4 py-2 text-[11px] text-slate-500">
                      {r.fechaAccidente.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <p className="font-medium">{r.trabajadorNombre}</p>
                      <p className="font-mono text-[10px] text-slate-500">
                        {r.trabajadorTipoDoc} {r.trabajadorNumeroDoc}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-700">{r.empresaRazonSocial}</td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          ESTADO_TONE[r.estado],
                        )}
                      >
                        {ESTADO_LABEL[r.estado]}
                      </span>
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
