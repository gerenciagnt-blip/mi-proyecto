import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Landmark, Calendar, Building2, Plus, CheckCircle2 } from 'lucide-react';
import type {
  MedioPagoFisico,
  MovimientoDetalleEstado,
  MovimientoFormaPago,
  MovimientoIncEstado,
} from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { cn } from '@/lib/utils';
import { formatCOP } from '@/lib/format';
import { NuevoDetalleForm } from './detalle-form';
import { ConciliarButton } from './conciliar-button';

export const metadata = { title: 'Detalle movimiento — Finanzas' };
export const dynamic = 'force-dynamic';

// Sprint Soporte reorg — formaPago quedó como legacy (los registros viejos
// la siguen mostrando). Para los nuevos detalles preferimos `medioPago`
// (efectivo/transferencia). Mostramos lo que tenga el detalle.
const FORMA_PAGO_LABEL: Record<MovimientoFormaPago, string> = {
  PAGO_COTIZANTE: 'Pago cotizante',
  PAGO_ALIADO: 'Pago aliado',
  CRUCE_COBRO_ALIADO: 'Cruce cobro aliado',
};
const MEDIO_PAGO_LABEL: Record<MedioPagoFisico, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
};
const DET_ESTADO_LABEL: Record<MovimientoDetalleEstado, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  PAGADA: 'Pagada',
  DEVUELTA: 'Devuelta',
};
const DET_ESTADO_TONE: Record<MovimientoDetalleEstado, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 ring-amber-200',
  EN_PROCESO: 'bg-sky-50 text-sky-700 ring-sky-200',
  PAGADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DEVUELTA: 'bg-red-50 text-red-700 ring-red-200',
};
const MOV_ESTADO_TONE: Record<MovimientoIncEstado, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 ring-amber-200',
  CONCILIADO: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ANULADO: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default async function MovimientoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;

  const mov = await prisma.movimientoIncapacidad.findUnique({
    where: { id },
    include: {
      empresa: { select: { nombre: true, nit: true } },
      detalles: {
        orderBy: { createdAt: 'desc' },
        include: {
          sucursal: { select: { codigo: true, nombre: true } },
          incapacidad: { select: { consecutivo: true } },
          pagadoConEmpresa: { select: { nombre: true } },
        },
      },
    },
  });
  if (!mov) notFound();

  const sumaDetalles = mov.detalles.reduce((s, d) => s + Number(d.subtotal), 0);
  const diff = Math.abs(sumaDetalles - Number(mov.valor));
  const cuadrado = diff < 0.01;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/soporte/finanzas/movimientos-incapacidades"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3 w-3" /> Movimientos
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <Landmark className="h-6 w-6 text-brand-blue" />
            <span className="font-mono text-xl">{mov.consecutivo}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            <Calendar className="mr-1 inline h-3 w-3" />
            {mov.fechaIngreso.toLocaleDateString('es-CO')}
            {mov.bancoOrigen && (
              <>
                {' · '}
                <span className="font-medium">{mov.bancoOrigen}</span>
              </>
            )}
            {mov.empresa && (
              <>
                {' · '}
                <Building2 className="mr-1 inline h-3 w-3" />
                {mov.empresa.nombre}
              </>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">{mov.concepto}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              'inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
              MOV_ESTADO_TONE[mov.estado],
            )}
          >
            {mov.estado}
          </span>
          <p className="font-mono text-2xl font-bold text-slate-900">
            {formatCOP(Number(mov.valor))}
          </p>
        </div>
      </header>

      {/* Indicador cuadre */}
      <section
        className={cn(
          'rounded-xl border p-4',
          cuadrado ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50',
        )}
      >
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className={cn('font-semibold', cuadrado ? 'text-emerald-900' : 'text-amber-900')}>
            {cuadrado ? '✓ Cuadrado' : '⚠ Descuadrado'}
          </span>
          <span className="text-slate-600">
            Detalles: <span className="font-mono">{mov.detalles.length}</span>
            {' · '}
            Suma: <span className="font-mono font-semibold">{formatCOP(sumaDetalles)}</span>
            {' · '}
            Valor mov.:{' '}
            <span className="font-mono font-semibold">{formatCOP(Number(mov.valor))}</span>
            {!cuadrado && (
              <>
                {' · '}
                Diferencia:{' '}
                <span className="font-mono font-semibold text-red-700">{formatCOP(diff)}</span>
              </>
            )}
          </span>
          {cuadrado && mov.estado === 'PENDIENTE' && <ConciliarButton movimientoId={mov.id} />}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Detalles */}
        <div className="lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Detalles ({mov.detalles.length})
              </h2>
            </header>
            {mov.detalles.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-500">
                Sin detalles. Agrega uno usando el formulario de la derecha.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Cotizante</th>
                      <th className="px-4 py-2">Aliado</th>
                      <th className="px-4 py-2">Forma pago</th>
                      <th className="px-4 py-2">Período inc.</th>
                      <th className="px-4 py-2 text-right">Subtotal</th>
                      <th className="px-4 py-2 text-right">Ret.</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mov.detalles.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <p className="font-medium">{d.nombreCompleto}</p>
                          <p className="font-mono text-[10px] text-slate-500">
                            {d.tipoDocumento} {d.numeroDocumento}
                          </p>
                          {d.incapacidad && (
                            <p className="text-[10px] text-brand-blue">
                              → {d.incapacidad.consecutivo}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-[11px] text-slate-600">
                          {d.sucursal?.codigo ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-[11px]">
                          {d.medioPago
                            ? MEDIO_PAGO_LABEL[d.medioPago]
                            : d.formaPago
                              ? FORMA_PAGO_LABEL[d.formaPago]
                              : '—'}
                        </td>
                        <td className="px-4 py-2 font-mono text-[10px] text-slate-500">
                          {d.fechaInicioInc && d.fechaFinInc ? (
                            <>
                              {d.fechaInicioInc.toISOString().slice(0, 10)}
                              <br />
                              {d.fechaFinInc.toISOString().slice(0, 10)}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {formatCOP(Number(d.subtotal))}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-[10px] text-red-700">
                          -{formatCOP(Number(d.retencion4x1000) + Number(d.retencionImpuesto))}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-emerald-700">
                          {formatCOP(Number(d.totalPagar))}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                              DET_ESTADO_TONE[d.estado],
                            )}
                          >
                            {DET_ESTADO_LABEL[d.estado]}
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

        {/* Nuevo detalle */}
        <aside>
          <section className="rounded-xl border border-brand-blue/20 bg-sky-50/40 shadow-sm">
            <header className="border-b border-brand-blue/20 px-5 py-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <Plus className="h-4 w-4 text-brand-blue" />
                Agregar detalle
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Busca por documento, valida con incapacidad asociada y calcula retenciones
                automáticas.
              </p>
            </header>
            <div className="px-5 py-4">
              {mov.estado === 'ANULADO' ? (
                <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-500">
                  Movimiento anulado — no se pueden agregar detalles.
                </p>
              ) : (
                <NuevoDetalleForm movimientoId={mov.id} />
              )}
            </div>
          </section>
          {mov.estado === 'CONCILIADO' && (
            <p className="mt-3 flex items-center justify-center gap-1 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              Movimiento conciliado
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
