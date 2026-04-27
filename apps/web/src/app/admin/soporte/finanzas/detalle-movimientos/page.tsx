import Link from 'next/link';
import { ArrowLeft, FileSearch, AlertCircle } from 'lucide-react';
import type { MedioPagoFisico, MovimientoDetalleEstado, Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { formatCOP } from '@/lib/format';
import { ConsultaButton } from './consulta-modal';
import { GestionButton } from './gestion-modal';

/**
 * Sprint Soporte reorg — Listado consolidado de TODOS los detalles de
 * movimientos (un detalle = un cotizante pagado dentro de un depósito
 * bancario). Reemplaza el link 404 que tenía el hub Finanzas.
 *
 * Por qué una vista global: cuando un movimiento bancario llega y se
 * conciliará con varias incapacidades, este detalle es el desglose
 * pago-a-pago. Sopote necesita poder buscar "¿pagaron la incapacidad
 * de Juan Pérez?" sin tener que abrir cada movimiento uno por uno.
 *
 * Acciones inline (marcar pagado, subir comprobante) viven dentro del
 * detalle del movimiento padre — desde acá se ofrece el link rápido.
 */
export const metadata = { title: 'Detalle Movimientos · Finanzas' };
export const dynamic = 'force-dynamic';

type SP = {
  estado?: string;
  medioPago?: string;
  q?: string;
  sucursalId?: string;
  desde?: string;
  hasta?: string;
};

const ESTADO_LABEL: Record<MovimientoDetalleEstado, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  PAGADA: 'Pagada',
  DEVUELTA: 'Devuelta',
};
const ESTADO_TONE: Record<MovimientoDetalleEstado, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 ring-amber-200',
  EN_PROCESO: 'bg-sky-50 text-sky-700 ring-sky-200',
  PAGADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DEVUELTA: 'bg-red-50 text-red-700 ring-red-200',
};

const MEDIO_LABEL: Record<MedioPagoFisico, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
};
const MEDIO_TONE: Record<MedioPagoFisico, string> = {
  EFECTIVO: 'bg-emerald-50 text-emerald-700',
  TRANSFERENCIA: 'bg-sky-50 text-sky-700',
};

export default async function DetalleMovimientosPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireStaff();
  const sp = await searchParams;

  const estadoFilter: MovimientoDetalleEstado | undefined =
    sp.estado === 'PENDIENTE' ||
    sp.estado === 'EN_PROCESO' ||
    sp.estado === 'PAGADA' ||
    sp.estado === 'DEVUELTA'
      ? (sp.estado as MovimientoDetalleEstado)
      : undefined;
  const medioPagoFilter: MedioPagoFisico | undefined =
    sp.medioPago === 'EFECTIVO' || sp.medioPago === 'TRANSFERENCIA'
      ? (sp.medioPago as MedioPagoFisico)
      : undefined;
  const sucursalFilter = sp.sucursalId?.trim() ?? '';
  const q = sp.q?.trim() ?? '';
  const desde = sp.desde ?? '';
  const hasta = sp.hasta ?? '';

  const where: Prisma.MovimientoIncDetalleWhereInput = {};
  if (estadoFilter) where.estado = estadoFilter;
  if (medioPagoFilter) where.medioPago = medioPagoFilter;
  if (sucursalFilter) where.sucursalId = sucursalFilter;
  if (q) {
    where.OR = [
      { numeroDocumento: { contains: q, mode: 'insensitive' } },
      { nombreCompleto: { contains: q, mode: 'insensitive' } },
      { incapacidadId: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (desde || hasta) {
    where.fechaPago = {};
    if (desde) where.fechaPago.gte = new Date(desde + 'T00:00:00');
    if (hasta) where.fechaPago.lte = new Date(hasta + 'T23:59:59');
  }

  const [detalles, statsByEstado, statsByMedio, sucursales, empresas] = await Promise.all([
    prisma.movimientoIncDetalle.findMany({
      where,
      orderBy: [{ fechaPago: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: {
        movimiento: {
          select: {
            id: true,
            consecutivo: true,
            fechaIngreso: true,
            bancoOrigen: true,
            entidadSgss: { select: { tipo: true, nombre: true } },
          },
        },
        incapacidad: { select: { consecutivo: true } },
        sucursal: { select: { codigo: true, nombre: true } },
        pagadoConEmpresa: { select: { id: true, nombre: true, nit: true } },
      },
    }),
    prisma.movimientoIncDetalle.groupBy({
      by: ['estado'],
      _count: { _all: true },
      _sum: { totalPagar: true },
    }),
    prisma.movimientoIncDetalle.groupBy({
      by: ['medioPago'],
      _count: { _all: true },
      _sum: { totalPagar: true },
    }),
    prisma.sucursal.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
    // Empresas para el modal de Gestión (selector "pagado con").
    prisma.empresa.findMany({
      where: { active: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nit: true, nombre: true },
    }),
  ]);

  const countsEstado = new Map<MovimientoDetalleEstado, { n: number; total: number }>();
  for (const r of statsByEstado) {
    countsEstado.set(r.estado, {
      n: r._count._all,
      total: r._sum.totalPagar ? Number(r._sum.totalPagar) : 0,
    });
  }

  const countsMedio = new Map<MedioPagoFisico, { n: number; total: number }>();
  for (const r of statsByMedio) {
    if (!r.medioPago) continue;
    countsMedio.set(r.medioPago, {
      n: r._count._all,
      total: r._sum.totalPagar ? Number(r._sum.totalPagar) : 0,
    });
  }

  const hayFiltros = Boolean(
    estadoFilter || medioPagoFilter || sucursalFilter || q || desde || hasta,
  );

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
          <FileSearch className="h-6 w-6 text-brand-blue" />
          Detalle Movimientos
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Desglose por cotizante de cada movimiento bancario, con retenciones calculadas (4×1000 +
          impuesto) y forma de pago.
        </p>
      </header>

      {/* Stats por estado */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.keys(ESTADO_LABEL) as MovimientoDetalleEstado[]).map((e) => {
          const c = countsEstado.get(e);
          return (
            <div
              key={e}
              className={cn(
                'rounded-xl border bg-white p-3 shadow-sm',
                e === 'PENDIENTE' && 'border-amber-200',
                e === 'EN_PROCESO' && 'border-sky-200',
                e === 'PAGADA' && 'border-emerald-200',
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

      {/* Stats por medio de pago — solo se cuentan los que ya tienen
          el medio asignado (gestionados). Los pendientes/sin medio no
          aparecen acá; sí aparecen en stats por estado arriba. */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Por medio de pago
        </p>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(MEDIO_LABEL) as MedioPagoFisico[]).map((m) => {
            const c = countsMedio.get(m);
            return (
              <div key={m} className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
                    MEDIO_TONE[m],
                  )}
                >
                  {MEDIO_LABEL[m]}
                </span>
                <span className="font-mono text-xs text-slate-700">{c?.n ?? 0}</span>
                {c && c.total > 0 && (
                  <span className="font-mono text-[10px] text-slate-500">{formatCOP(c.total)}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form
            method="GET"
            action="/admin/soporte/finanzas/detalle-movimientos"
            className="flex flex-wrap items-end gap-2 text-xs"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Pago desde
              </span>
              <input
                type="date"
                name="desde"
                defaultValue={desde}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Pago hasta
              </span>
              <input
                type="date"
                name="hasta"
                defaultValue={hasta}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Estado</span>
              <select
                name="estado"
                defaultValue={estadoFilter ?? ''}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">Todos</option>
                {(Object.keys(ESTADO_LABEL) as MovimientoDetalleEstado[]).map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_LABEL[e]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Medio pago
              </span>
              <select
                name="medioPago"
                defaultValue={medioPagoFilter ?? ''}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">Todos</option>
                {(Object.keys(MEDIO_LABEL) as MedioPagoFisico[]).map((m) => (
                  <option key={m} value={m}>
                    {MEDIO_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Sucursal</span>
              <select
                name="sucursalId"
                defaultValue={sucursalFilter}
                className="h-9 min-w-[160px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">Todas</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.codigo} · {s.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Buscar</span>
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Doc, nombre o consec. incapacidad…"
                className="h-9 min-w-[200px] rounded-lg border border-slate-300 bg-white px-3 text-xs"
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-xs font-medium text-white hover:bg-brand-blue-dark"
            >
              Aplicar
            </button>
            {hayFiltros && (
              <Link
                href="/admin/soporte/finanzas/detalle-movimientos"
                className="h-9 leading-9 text-xs text-slate-500 underline"
              >
                Limpiar
              </Link>
            )}
            <span className="ml-auto self-center text-xs text-slate-500">{detalles.length}</span>
          </form>
        </div>

        {detalles.length === 0 ? (
          <Alert variant="info" className="m-5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              {hayFiltros
                ? 'Sin resultados con los filtros actuales.'
                : 'Aún no hay detalles. Cuando se desglosen los movimientos bancarios por cotizante aparecerán aquí.'}
            </span>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Pago</th>
                  <th className="px-3 py-2">Cotizante</th>
                  <th className="px-3 py-2">Sucursal</th>
                  <th className="px-3 py-2">Incapacidad</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2 text-right">Retenciones</th>
                  <th className="px-3 py-2 text-right">Total a pagar</th>
                  <th className="px-3 py-2">Medio</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detalles.map((d) => {
                  const retenciones = Number(d.retencion4x1000) + Number(d.retencionImpuesto);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-[11px] text-slate-600">
                        {d.fechaPago ? (
                          d.fechaPago.toLocaleDateString('es-CO')
                        ) : (
                          <span className="text-slate-400">Sin pagar</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <p className="font-medium">{d.nombreCompleto}</p>
                        <p className="font-mono text-[10px] text-slate-500">
                          {d.tipoDocumento} {d.numeroDocumento}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {d.sucursal ? (
                          <span className="font-mono font-semibold text-slate-700">
                            {d.sucursal.codigo}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-700">
                        {d.incapacidad?.consecutivo ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">
                        {formatCOP(Number(d.subtotal))}
                      </td>
                      <td
                        className="px-3 py-2 text-right font-mono text-[10px] text-slate-500"
                        title={`4x1000: ${formatCOP(Number(d.retencion4x1000))} · Impuesto: ${formatCOP(Number(d.retencionImpuesto))}`}
                      >
                        −{formatCOP(retenciones)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-emerald-700">
                        {formatCOP(Number(d.totalPagar))}
                      </td>
                      <td className="px-3 py-2">
                        {d.medioPago ? (
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
                              MEDIO_TONE[d.medioPago],
                            )}
                          >
                            {MEDIO_LABEL[d.medioPago]}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                            ESTADO_TONE[d.estado],
                          )}
                        >
                          {ESTADO_LABEL[d.estado]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <ConsultaButton detalleId={d.id} />
                          <GestionButton
                            detalle={{
                              id: d.id,
                              estado: d.estado,
                              fechaPago: d.fechaPago?.toISOString() ?? null,
                              medioPago: d.medioPago,
                              numeroTransaccion: d.numeroTransaccion,
                              pagadoConEmpresaId: d.pagadoConEmpresa?.id ?? null,
                              observaciones: d.observaciones,
                            }}
                            empresas={empresas}
                          />
                        </div>
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
