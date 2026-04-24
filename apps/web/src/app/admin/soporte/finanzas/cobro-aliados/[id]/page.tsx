import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  DollarSign,
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import type { CobroAliadoEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { cn } from '@/lib/utils';
import { formatCOP } from '@/lib/format';
import { MarcarPagadoForm } from './marcar-pagado-form';

export const metadata = { title: 'Detalle cobro · Finanzas' };
export const dynamic = 'force-dynamic';

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
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  return `${meses[m - 1]} ${a}`;
}

export default async function CobroDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const [cobro, mediosPago] = await Promise.all([
    prisma.cobroAliado.findUnique({
      where: { id },
      include: {
        sucursal: {
          select: {
            codigo: true,
            nombre: true,
            bloqueadaPorMora: true,
            tarifaOrdinario: true,
            tarifaResolucion: true,
          },
        },
        periodo: { select: { anio: true, mes: true } },
        medioPago: { select: { nombre: true } },
        conceptos: { orderBy: [{ tipo: 'asc' }, { descripcion: 'asc' }] },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.medioPago.findMany({
      where: { active: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true },
    }),
  ]);

  if (!cobro) notFound();

  const vencido = cobro.estado === 'PENDIENTE' && cobro.fechaLimite < new Date();

  const conceptosAfiliacion = cobro.conceptos.filter((c) => c.tipo === 'AFILIACION_PROCESADA');
  const conceptosMensualidad = cobro.conceptos.filter((c) => c.tipo === 'MENSUALIDAD');

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/soporte/finanzas/cobro-aliados"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3 w-3" /> Cobro Aliados
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <DollarSign className="h-6 w-6 text-brand-blue" />
            <span className="font-mono text-xl">{cobro.consecutivo}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            <Building2 className="mr-1 inline h-3 w-3" />
            <span className="font-medium text-slate-700">{cobro.sucursal.codigo}</span>
            {' · '}
            {cobro.sucursal.nombre}
            {' · '}
            <Calendar className="mr-1 inline h-3 w-3" />
            {mesLabel(cobro.periodo.anio, cobro.periodo.mes)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              'inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
              ESTADO_TONE[cobro.estado],
            )}
          >
            {ESTADO_LABEL[cobro.estado]}
          </span>
          {vencido && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
              <AlertTriangle className="h-3 w-3" />
              Vencido desde {cobro.fechaLimite.toLocaleDateString('es-CO')}
            </span>
          )}
          {cobro.sucursal.bloqueadaPorMora && (
            <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
              Sucursal bloqueada por mora
            </span>
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Izquierda — totales + detalle */}
        <div className="space-y-5 lg:col-span-2">
          {/* Resumen totales */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-700">Resumen</h2>
            </header>
            <dl className="divide-y divide-slate-100 px-5 py-2 text-sm">
              <Row label="Afiliaciones procesadas">
                <span className="font-mono">{cobro.cantAfiliaciones}</span>
                <span className="ml-2 text-xs text-slate-500">
                  × {formatCOP(Number(cobro.sucursal.tarifaOrdinario ?? 0))} (ORD) /{' '}
                  {formatCOP(Number(cobro.sucursal.tarifaResolucion ?? 0))} (RES)
                </span>
                <span className="ml-auto font-mono font-semibold">
                  {formatCOP(Number(cobro.valorAfiliaciones))}
                </span>
              </Row>
              <Row label="Mensualidades">
                <span className="font-mono">{cobro.cantMensualidades}</span>
                <span className="ml-auto font-mono font-semibold">
                  {formatCOP(Number(cobro.valorMensualidades))}
                </span>
              </Row>
              <Row label="Total cobro" highlight>
                <span className="ml-auto font-mono text-lg font-bold text-brand-blue-dark">
                  {formatCOP(Number(cobro.totalCobro))}
                </span>
              </Row>
              <Row label="Fecha generado">
                <span className="ml-auto text-xs text-slate-600">
                  {cobro.fechaGenerado.toLocaleString('es-CO')}
                  {cobro.createdBy && ` · ${cobro.createdBy.name}`}
                </span>
              </Row>
              <Row label="Fecha límite">
                <span
                  className={cn(
                    'ml-auto text-xs',
                    vencido ? 'font-semibold text-red-700' : 'text-slate-600',
                  )}
                >
                  {cobro.fechaLimite.toLocaleDateString('es-CO')}
                </span>
              </Row>
              {cobro.fechaPagado && (
                <Row label="Fecha pagado">
                  <span className="ml-auto text-xs text-emerald-700">
                    {cobro.fechaPagado.toLocaleString('es-CO')}
                  </span>
                </Row>
              )}
              {cobro.medioPago && (
                <Row label="Medio de pago">
                  <span className="ml-auto text-xs text-slate-600">{cobro.medioPago.nombre}</span>
                </Row>
              )}
              {cobro.referenciaPago && (
                <Row label="Referencia">
                  <span className="ml-auto font-mono text-xs">{cobro.referenciaPago}</span>
                </Row>
              )}
              {cobro.observaciones && (
                <Row label="Observaciones">
                  <span className="ml-auto text-xs text-slate-700 whitespace-pre-line">
                    {cobro.observaciones}
                  </span>
                </Row>
              )}
            </dl>
          </section>

          {/* Conceptos */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <FileText className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">
                Desglose ({cobro.conceptos.length} conceptos)
              </h2>
            </header>
            {cobro.conceptos.length === 0 ? (
              <p className="px-5 py-4 text-xs text-slate-500">Sin conceptos.</p>
            ) : (
              <div className="overflow-x-auto">
                {conceptosAfiliacion.length > 0 && (
                  <ConceptosTable
                    titulo={`Afiliaciones procesadas (${conceptosAfiliacion.length})`}
                    conceptos={conceptosAfiliacion}
                    tono="sky"
                  />
                )}
                {conceptosMensualidad.length > 0 && (
                  <ConceptosTable
                    titulo={`Mensualidades (${conceptosMensualidad.length})`}
                    conceptos={conceptosMensualidad}
                    tono="violet"
                  />
                )}
              </div>
            )}
          </section>
        </div>

        {/* Derecha — acción "Marcar pagado" */}
        <aside className="space-y-3">
          {cobro.estado === 'PENDIENTE' || cobro.estado === 'VENCIDO' ? (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-sm">
              <header className="border-b border-emerald-200/60 px-5 py-3">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Registrar pago
                </h2>
                <p className="mt-0.5 text-[11px] text-emerald-700">
                  Al marcar pagado, se desbloquea automáticamente la sucursal si no tiene otros
                  cobros vencidos.
                </p>
              </header>
              <div className="px-5 py-4">
                <MarcarPagadoForm cobroId={cobro.id} mediosPago={mediosPago} />
              </div>
            </section>
          ) : cobro.estado === 'PAGADO' ? (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
              <p className="mt-2 text-sm font-semibold text-emerald-800">Cobro pagado</p>
              {cobro.fechaPagado && (
                <p className="mt-1 text-[11px] text-emerald-700">
                  {cobro.fechaPagado.toLocaleString('es-CO')}
                </p>
              )}
            </section>
          ) : (
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
              Cobro anulado. Sin acciones disponibles.
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
  highlight,
}: {
  label: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-3 py-2', highlight && 'bg-slate-50/70 -mx-5 px-5')}>
      <dt className={cn('text-xs', highlight ? 'font-semibold text-slate-800' : 'text-slate-500')}>
        {label}
      </dt>
      <dd className="ml-2 flex flex-1 items-center">{children}</dd>
    </div>
  );
}

function ConceptosTable({
  titulo,
  conceptos,
  tono,
}: {
  titulo: string;
  conceptos: Array<{
    id: string;
    descripcion: string | null;
    regimen: 'ORDINARIO' | 'RESOLUCION' | null;
    cantidad: number;
    valorUnit: unknown;
    subtotal: unknown;
  }>;
  tono: 'sky' | 'violet';
}) {
  const toneClass = tono === 'sky' ? 'bg-sky-50 text-sky-800' : 'bg-violet-50 text-violet-800';
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <h3 className={cn('px-5 py-2 text-[11px] font-semibold uppercase tracking-wider', toneClass)}>
        {titulo}
      </h3>
      <table className="w-full text-xs">
        <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-5 py-1.5">Descripción</th>
            <th className="px-5 py-1.5">Régimen</th>
            <th className="px-5 py-1.5 text-right">Cant</th>
            <th className="px-5 py-1.5 text-right">V. unit</th>
            <th className="px-5 py-1.5 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {conceptos.map((c) => (
            <tr key={c.id}>
              <td className="px-5 py-1.5">{c.descripcion}</td>
              <td className="px-5 py-1.5 text-slate-500">{c.regimen ?? '—'}</td>
              <td className="px-5 py-1.5 text-right font-mono">{c.cantidad}</td>
              <td className="px-5 py-1.5 text-right font-mono">{formatCOP(Number(c.valorUnit))}</td>
              <td className="px-5 py-1.5 text-right font-mono font-semibold">
                {formatCOP(Number(c.subtotal))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
