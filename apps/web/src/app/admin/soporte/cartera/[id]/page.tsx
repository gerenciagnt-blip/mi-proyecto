import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, Download, UserCircle2, FileSpreadsheet, Info } from 'lucide-react';
import type { CarteraEstado, Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { formatCOP } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ESTADO_LINEA_LABEL, ESTADO_CONSOLIDADO_LABEL, ESTADO_TONE } from '@/lib/cartera/labels';
import { GestionarLineaButton } from '../gestion-dialog';
import { AnularConsolidadoButton } from '../anular-button';
import { VerGestionesButton } from '../ver-gestiones-dialog';
import { TransicionConsolidadoButtons } from '../transicion-consolidado';
import { DiasSinGestionChip } from '@/components/admin/dias-sin-gestion-chip';

export const metadata = { title: 'Detalle consolidado · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = { doc?: string; sucursalId?: string; estado?: string };

export default async function ConsolidadoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const docQ = sp.doc?.trim() ?? '';
  const sucursalIdFilter = sp.sucursalId?.trim() ?? '';
  const estadoFilter: CarteraEstado | undefined =
    sp.estado === 'EN_CONCILIACION' ||
    sp.estado === 'CONCILIADA' ||
    sp.estado === 'MORA_REAL' ||
    sp.estado === 'CARTERA_REAL' ||
    sp.estado === 'PAGADA_CARTERA_REAL'
      ? (sp.estado as CarteraEstado)
      : undefined;

  // Where del detallado (filtros opcionales en la misma vista)
  const whereDet: Prisma.CarteraDetalladoWhereInput = {
    consolidadoId: id,
  };
  if (docQ) {
    whereDet.OR = [
      { numeroDocumento: { contains: docQ, mode: 'insensitive' } },
      { nombreCompleto: { contains: docQ, mode: 'insensitive' } },
    ];
  }
  if (sucursalIdFilter === 'NULL') {
    whereDet.sucursalAsignadaId = null;
  } else if (sucursalIdFilter) {
    whereDet.sucursalAsignadaId = sucursalIdFilter;
  }
  if (estadoFilter) whereDet.estado = estadoFilter;

  const [consolidado, detalladoFiltrado, sucursales] = await Promise.all([
    prisma.carteraConsolidado.findUnique({
      where: { id },
      include: {
        empresa: { select: { id: true, nombre: true } },
        createdBy: { select: { name: true, email: true } },
        // `detallado` aquí es SOLO para agregados por estado (full list).
        detallado: {
          select: { estado: true, valorCobro: true },
        },
      },
    }),
    prisma.carteraDetallado.findMany({
      where: whereDet,
      orderBy: [{ nombreCompleto: 'asc' }, { periodoCobro: 'asc' }],
      include: {
        sucursalAsignada: { select: { id: true, codigo: true, nombre: true } },
        cotizante: { select: { id: true } },
        _count: { select: { gestiones: true } },
        // Última gestión para calcular "días sin movimiento". Si no hay
        // ninguna, fallback al createdAt de la propia línea.
        gestiones: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        },
      },
    }),
    prisma.sucursal.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
  ]);

  if (!consolidado) notFound();

  // Agregación: cuántas líneas por estado (basado en el full list)
  const porEstado = new Map<CarteraEstado, { count: number; total: number }>();
  for (const d of consolidado.detallado) {
    const prev = porEstado.get(d.estado) ?? { count: 0, total: 0 };
    prev.count++;
    prev.total += Number(d.valorCobro);
    porEstado.set(d.estado, prev);
  }

  const hayFiltros = !!docQ || !!sucursalIdFilter || !!estadoFilter;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/soporte/cartera"
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Consolidados</span>
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
              <FileText className="h-6 w-6 text-brand-blue" />
              <span className="font-mono">{consolidado.consecutivo}</span>
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {consolidado.entidadNombre} · {consolidado.empresaRazonSocial}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Sprint Soporte reorg fase 2 — Transición del consolidado
                (Enviada → Conciliada). Solo aparece cuando aplica. */}
            <TransicionConsolidadoButtons
              consolidadoId={consolidado.id}
              estadoActual={consolidado.estado}
            />
            <a
              href={`/api/cartera/${consolidado.id}/export.xlsx`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              title="Descargar Excel con cabecera y detalle (para enviar a la entidad o trabajar offline)"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </a>
            {consolidado.archivoOrigenPath && (
              <a
                href={`/api/cartera/${consolidado.id}/pdf`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                title="Descargar PDF original"
              >
                <Download className="h-3.5 w-3.5" />
                PDF
              </a>
            )}
            <AnularConsolidadoButton
              consolidadoId={consolidado.id}
              consecutivo={consolidado.consecutivo}
            />
          </div>
        </div>
      </div>

      {/* Cabecera */}
      <section className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <Field label="Tipo entidad" value={consolidado.tipoEntidad} />
        <Field label="NIT entidad" value={consolidado.entidadNit ?? '—'} />
        <Field
          label="Empresa"
          value={`${consolidado.empresa?.nombre ?? consolidado.empresaRazonSocial}`}
          sub={`NIT ${consolidado.empresaNit}`}
        />
        <Field
          label="Período"
          value={
            consolidado.periodoDesde && consolidado.periodoHasta
              ? `${consolidado.periodoDesde} → ${consolidado.periodoHasta}`
              : (consolidado.periodoHasta ?? '—')
          }
        />
        <Field
          label="Total informado"
          value={formatCOP(Number(consolidado.valorTotalInformado))}
          highlight
        />
        <Field label="Líneas" value={String(consolidado.cantidadRegistros)} />
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Estado consolidado
          </p>
          <span
            className={cn(
              'mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
              ESTADO_TONE[consolidado.estado],
            )}
          >
            {ESTADO_CONSOLIDADO_LABEL[consolidado.estado]}
          </span>
        </div>
        <Field
          label="Cargado por"
          value={consolidado.createdBy?.name ?? '—'}
          sub={consolidado.fechaRegistro.toLocaleString('es-CO')}
        />
      </section>

      {/* Distribución por estado */}
      <section className="flex flex-wrap gap-2">
        {(
          Array.from(porEstado.entries()) as Array<
            [CarteraEstado, { count: number; total: number }]
          >
        ).map(([estado, stat]) => (
          <span
            key={estado}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
              ESTADO_TONE[estado],
            )}
          >
            {ESTADO_LINEA_LABEL[estado]}
            <span className="font-mono">· {stat.count}</span>
            <span className="font-mono">· {formatCOP(stat.total)}</span>
          </span>
        ))}
      </section>

      {/* Filtros del detallado */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form
            method="GET"
            action={`/admin/soporte/cartera/${consolidado.id}`}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="flex-1 min-w-[200px]">
              <label
                htmlFor="doc"
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500"
              >
                Documento o nombre
              </label>
              <input
                type="search"
                id="doc"
                name="doc"
                defaultValue={docQ}
                placeholder="Cédula, nombre…"
                className="mt-0.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400"
              />
            </div>
            <div>
              <label
                htmlFor="sucursalId"
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500"
              >
                Sucursal
              </label>
              <select
                id="sucursalId"
                name="sucursalId"
                defaultValue={sucursalIdFilter}
                className="mt-0.5 h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
              >
                <option value="">Todas</option>
                <option value="NULL">Sin asignar</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.codigo} · {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="estado"
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500"
              >
                Estado
              </label>
              <select
                id="estado"
                name="estado"
                defaultValue={estadoFilter ?? ''}
                className="mt-0.5 h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="EN_CONCILIACION">En conciliación</option>
                <option value="CONCILIADA">Conciliada</option>
                <option value="MORA_REAL">Mora real</option>
                <option value="CARTERA_REAL">Cartera real</option>
                <option value="PAGADA_CARTERA_REAL">Pagada</option>
              </select>
            </div>
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-blue-dark"
            >
              Filtrar
            </button>
            {hayFiltros && (
              <Link
                href={`/admin/soporte/cartera/${consolidado.id}`}
                className="h-9 leading-9 text-xs text-slate-500 hover:text-slate-900"
              >
                Limpiar
              </Link>
            )}
            <span className="ml-auto self-end text-xs text-slate-500">
              {detalladoFiltrado.length} {detalladoFiltrado.length === 1 ? 'línea' : 'líneas'}
            </span>
          </form>
        </header>

        {/* Tabla detallado */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Documento</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Período</th>
                {/* Sprint Soporte reorg fase 2 — IBC + Novedad expuestos */}
                <th
                  className="px-4 py-2 text-right"
                  title="Ingreso Base de Cotización reportado por la entidad"
                >
                  IBC
                </th>
                <th
                  className="px-4 py-2 text-center"
                  title="Código de novedad reportado por la entidad (IGE, NVL, etc.)"
                >
                  Nov.
                </th>
                <th className="px-4 py-2 text-right">Valor</th>
                <th className="px-4 py-2">Sucursal</th>
                <th className="px-4 py-2">Estado</th>
                <th
                  className="px-4 py-2 text-center"
                  title="Días desde la última gestión sobre la línea"
                >
                  Días s/g
                </th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detalladoFiltrado.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-xs text-slate-400">
                    {hayFiltros
                      ? 'Sin resultados con los filtros actuales.'
                      : 'No hay líneas en este consolidado.'}
                  </td>
                </tr>
              ) : (
                detalladoFiltrado.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2 font-mono text-[11px]">
                      {d.tipoDocumento} {d.numeroDocumento}
                      {d.cotizanteId && (
                        <span className="ml-1 rounded bg-emerald-100 px-1 text-[9px] font-medium text-emerald-700">
                          match
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">{d.nombreCompleto}</td>
                    <td className="px-4 py-2 font-mono text-[11px] text-slate-500">
                      {d.periodoCobro}
                    </td>
                    {/* IBC */}
                    <td className="px-4 py-2 text-right font-mono text-[11px] text-slate-600">
                      {d.ibc != null ? formatCOP(Number(d.ibc)) : '—'}
                    </td>
                    {/* Novedad */}
                    <td className="px-4 py-2 text-center">
                      {d.novedad ? (
                        <span
                          className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
                          title={`Novedad: ${d.novedad}`}
                        >
                          {d.novedad}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-semibold">
                      {formatCOP(Number(d.valorCobro))}
                      {d.observaciones && (
                        <span
                          className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-200"
                          title={d.observaciones}
                        >
                          <Info className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {d.sucursalAsignada ? (
                        <>
                          <span className="font-mono text-[10px] font-semibold">
                            {d.sucursalAsignada.codigo}
                          </span>
                          <span className="ml-1 text-slate-500">{d.sucursalAsignada.nombre}</span>
                        </>
                      ) : (
                        <span className="italic text-amber-700">sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          ESTADO_TONE[d.estado],
                        )}
                      >
                        {ESTADO_LINEA_LABEL[d.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <DiasSinGestionChip
                        ultimaGestion={d.gestiones[0]?.createdAt ?? null}
                        fechaCreacion={d.createdAt}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {d.cotizanteId && (
                          <Link
                            href={`/admin/base-datos?q=${encodeURIComponent(d.numeroDocumento)}`}
                            target="_blank"
                            title="Ver formulario de afiliación completo del cotizante"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-brand-blue"
                          >
                            <UserCircle2 className="h-3.5 w-3.5" />
                          </Link>
                        )}
                        <VerGestionesButton
                          detalladoId={d.id}
                          gestionesCount={d._count.gestiones}
                          cotizante={{
                            tipo: d.tipoDocumento,
                            numero: d.numeroDocumento,
                            nombre: d.nombreCompleto,
                          }}
                          periodo={d.periodoCobro}
                          valor={Number(d.valorCobro)}
                          variant="chip"
                        />
                        <GestionarLineaButton
                          detalladoId={d.id}
                          estadoActual={d.estado}
                          sucursalActualId={d.sucursalAsignadaId}
                          sucursales={sucursales}
                          cotizante={{
                            tipo: d.tipoDocumento,
                            numero: d.numeroDocumento,
                            nombre: d.nombreCompleto,
                          }}
                          periodo={d.periodoCobro}
                          valor={Number(d.valorCobro)}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-mono text-sm',
          highlight ? 'font-bold text-brand-blue-dark' : 'text-slate-900',
        )}
      >
        {value}
      </p>
      {sub && <p className="font-mono text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}
