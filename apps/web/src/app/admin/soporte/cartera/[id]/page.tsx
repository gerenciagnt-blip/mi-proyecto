import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, Download, Trash2 } from 'lucide-react';
import type { CarteraEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { formatCOP } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GestionarLineaButton } from '../gestion-dialog';
import { AnularConsolidadoButton } from '../anular-button';

export const metadata = { title: 'Detalle consolidado · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

const ESTADO_LABEL: Record<CarteraEstado, string> = {
  EN_CONCILIACION: 'En conciliación',
  CONCILIADA: 'Conciliada',
  CARTERA_REAL: 'Cartera real',
  PAGADA_CARTERA_REAL: 'Pagada (cartera real)',
};

const ESTADO_TONE: Record<CarteraEstado, string> = {
  EN_CONCILIACION: 'bg-amber-50 text-amber-700 ring-amber-200',
  CONCILIADA: 'bg-sky-50 text-sky-700 ring-sky-200',
  CARTERA_REAL: 'bg-violet-50 text-violet-700 ring-violet-200',
  PAGADA_CARTERA_REAL: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export default async function ConsolidadoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [consolidado, sucursales] = await Promise.all([
    prisma.carteraConsolidado.findUnique({
      where: { id },
      include: {
        empresa: { select: { id: true, nombre: true } },
        createdBy: { select: { name: true, email: true } },
        detallado: {
          orderBy: [{ nombreCompleto: 'asc' }, { periodoCobro: 'asc' }],
          include: {
            sucursalAsignada: { select: { id: true, codigo: true, nombre: true } },
            cotizante: {
              select: { id: true, sucursal: { select: { codigo: true } } },
            },
            _count: { select: { gestiones: true } },
          },
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

  // Agregación: cuántas líneas por estado (para el header)
  const porEstado = new Map<CarteraEstado, { count: number; total: number }>();
  for (const d of consolidado.detallado) {
    const prev = porEstado.get(d.estado) ?? { count: 0, total: 0 };
    prev.count++;
    prev.total += Number(d.valorCobro);
    porEstado.set(d.estado, prev);
  }

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
              : consolidado.periodoHasta ?? '—'
          }
        />
        <Field
          label="Total informado"
          value={formatCOP(Number(consolidado.valorTotalInformado))}
          highlight
        />
        <Field label="Líneas" value={String(consolidado.cantidadRegistros)} />
        <Field
          label="Origen PDF"
          value={consolidado.origenPdf ?? 'MANUAL'}
        />
        <Field
          label="Cargado por"
          value={consolidado.createdBy?.name ?? '—'}
          sub={consolidado.fechaRegistro.toLocaleString('es-CO')}
        />
      </section>

      {/* Distribución por estado */}
      <section className="flex flex-wrap gap-2">
        {(Array.from(porEstado.entries()) as Array<[CarteraEstado, { count: number; total: number }]>).map(
          ([estado, stat]) => (
            <span
              key={estado}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                ESTADO_TONE[estado],
              )}
            >
              {ESTADO_LABEL[estado]}
              <span className="font-mono">· {stat.count}</span>
              <span className="font-mono">· {formatCOP(stat.total)}</span>
            </span>
          ),
        )}
      </section>

      {/* Tabla detallado */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Documento</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Período</th>
                <th className="px-4 py-2 text-right">Valor</th>
                <th className="px-4 py-2">Sucursal</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Gestiones</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consolidado.detallado.map((d) => (
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
                  <td className="px-4 py-2 text-right font-mono text-xs font-semibold">
                    {formatCOP(Number(d.valorCobro))}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {d.sucursalAsignada ? (
                      <>
                        <span className="font-mono text-[10px] font-semibold">
                          {d.sucursalAsignada.codigo}
                        </span>
                        <span className="ml-1 text-slate-500">
                          {d.sucursalAsignada.nombre}
                        </span>
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
                      {ESTADO_LABEL[d.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {d._count.gestiones}
                  </td>
                  <td className="px-4 py-2 text-right">
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
                  </td>
                </tr>
              ))}
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
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
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
