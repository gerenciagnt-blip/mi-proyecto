'use client';

/**
 * Sprint Soporte reorg — Modal de consulta read-only.
 *
 * Reemplaza el link directo "Movimiento" que había en la tabla. Al
 * abrir trae el detalle, el movimiento padre y la lista de detalles
 * hermanos. Adentro hay un link "Ir al movimiento" para los casos en
 * que se necesite la edición completa.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Eye,
  Loader2,
  Receipt,
  Building2,
  Calendar,
  ExternalLink,
  Paperclip,
  Download,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatCOP } from '@/lib/format';
import { getDetalleConsultaAction, type DetalleConsulta } from './actions';

const DET_ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  PAGADA: 'Pagada',
  DEVUELTA: 'Devuelta',
};
const DET_ESTADO_TONE: Record<string, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 ring-amber-200',
  EN_PROCESO: 'bg-sky-50 text-sky-700 ring-sky-200',
  PAGADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DEVUELTA: 'bg-red-50 text-red-700 ring-red-200',
};

const MEDIO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO');
}

function DataRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1 text-xs">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn('col-span-2 text-slate-900', mono && 'font-mono')}>{value || '—'}</dd>
    </div>
  );
}

export function ConsultaButton({ detalleId }: { detalleId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[10px] font-medium text-slate-700 hover:border-brand-blue hover:bg-brand-blue/5"
        title="Consulta"
      >
        <Eye className="h-3 w-3" />
        Consulta
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Consulta de pago"
        description="Información del detalle y del movimiento bancario padre."
        size="xl"
      >
        <ConsultaContent detalleId={detalleId} open={open} />
      </Dialog>
    </>
  );
}

function ConsultaContent({ detalleId, open }: { detalleId: string; open: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DetalleConsulta | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    getDetalleConsultaAction(detalleId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setData(res.data);
        else setError(res.error);
      })
      .catch(() => {
        if (!cancelled) setError('Error al cargar el detalle');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detalleId, open]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando detalle…
      </div>
    );
  }

  if (error) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>;
  }

  if (!data) return null;

  const retenciones = data.retencion4x1000 + data.retencionImpuesto;
  const archivado = false; // los soportes de detalle no tienen retención por ahora

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Izquierda — info principal del detalle */}
      <div className="space-y-4 lg:col-span-2">
        {/* Cotizante / pago */}
        <section className="rounded-lg border border-slate-200 bg-white">
          <header className="border-b border-slate-100 px-4 py-2">
            <h3 className="text-xs font-semibold text-slate-700">Cotizante / pago</h3>
          </header>
          <dl className="divide-y divide-slate-100 px-4 py-1">
            <DataRow label="Nombre" value={data.cotizante.nombreCompleto} />
            <DataRow
              label="Documento"
              mono
              value={`${data.cotizante.tipoDocumento} ${data.cotizante.numeroDocumento}`}
            />
            <DataRow label="Sucursal aliado" value={data.cotizante.sucursalCodigo} />
            <DataRow label="Incapacidad" mono value={data.incapacidad?.consecutivo ?? null} />
            <DataRow
              label="Período inc."
              mono
              value={
                data.fechaInicioInc && data.fechaFinInc
                  ? `${fmtDate(data.fechaInicioInc)} → ${fmtDate(data.fechaFinInc)}`
                  : null
              }
            />
            <DataRow label="Subtotal" mono value={formatCOP(data.subtotal)} />
            <DataRow
              label="Retenciones"
              mono
              value={
                <span
                  title={`4×1000: ${formatCOP(data.retencion4x1000)} · Imp: ${formatCOP(data.retencionImpuesto)}`}
                >
                  −{formatCOP(retenciones)}
                </span>
              }
            />
            <DataRow
              label="Total a pagar"
              mono
              value={
                <span className="font-semibold text-emerald-700">{formatCOP(data.totalPagar)}</span>
              }
            />
            <DataRow
              label="Estado"
              value={
                <span
                  className={cn(
                    'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                    DET_ESTADO_TONE[data.estado] ?? '',
                  )}
                >
                  {DET_ESTADO_LABEL[data.estado] ?? data.estado}
                </span>
              }
            />
            <DataRow label="Fecha de pago" value={fmtDate(data.fechaPago)} />
            <DataRow
              label="Medio de pago"
              value={data.medioPago ? MEDIO_LABEL[data.medioPago] : null}
            />
            <DataRow label="# Transacción" mono value={data.numeroTransaccion} />
            <DataRow
              label="Empresa pagadora"
              value={
                data.pagadoConEmpresa
                  ? `${data.pagadoConEmpresa.nombre} (NIT ${data.pagadoConEmpresa.nit})`
                  : null
              }
            />
            <DataRow label="Observaciones" value={data.observaciones} />
          </dl>
        </section>

        {/* Soportes adjuntos */}
        <section className="rounded-lg border border-slate-200 bg-white">
          <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
            <Paperclip className="h-4 w-4 text-slate-500" />
            <h3 className="text-xs font-semibold text-slate-700">
              Soportes ({data.documentos.length})
            </h3>
          </header>
          {data.documentos.length === 0 ? (
            <p className="px-4 py-2.5 text-xs text-slate-500">
              Sin soportes adjuntos. Sube uno desde la gestión.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.documentos.map((d) => (
                <li key={d.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                  <Paperclip className="h-3 w-3 text-slate-400" />
                  <div className="flex-1 truncate">
                    <p className="font-medium">{d.nombre}</p>
                    <p className="text-[10px] text-slate-500">
                      {d.userName ?? '—'} · {(d.tamano / 1024).toFixed(0)} KB ·{' '}
                      {new Date(d.fecha).toLocaleDateString('es-CO')}
                    </p>
                  </div>
                  {!archivado && (
                    <a
                      href={`/api/mov-detalle/${data.id}/documentos/${d.id}`}
                      className="inline-flex items-center gap-0.5 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-2.5 w-2.5" />
                      Descargar
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Derecha — movimiento padre + detalles hermanos */}
      <aside className="space-y-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-brand-blue" />
            <h3 className="text-xs font-semibold text-slate-700">Movimiento padre</h3>
            <Link
              href={`/admin/soporte/finanzas/movimientos-incapacidades/${data.movimiento.id}`}
              className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-brand-blue hover:underline"
              title="Ir al movimiento"
            >
              Ir <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
          <p className="font-mono text-sm font-bold text-slate-900">
            {data.movimiento.consecutivo}
          </p>
          <p className="mt-1 text-[11px] text-slate-600">
            <Calendar className="mr-0.5 inline h-3 w-3" />
            {new Date(data.movimiento.fechaIngreso).toLocaleDateString('es-CO')}
            {data.movimiento.bancoOrigen && <> · {data.movimiento.bancoOrigen}</>}
          </p>
          {data.movimiento.entidadSgss && (
            <p className="mt-1 text-[11px]">
              <span className="rounded bg-slate-100 px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
                {data.movimiento.entidadSgss.tipo}
              </span>{' '}
              {data.movimiento.entidadSgss.nombre}
            </p>
          )}
          {data.movimiento.empresa && (
            <p className="mt-1 text-[11px] text-slate-600">
              <Building2 className="mr-0.5 inline h-3 w-3" />
              {data.movimiento.empresa.nombre}
            </p>
          )}
          <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">Valor depósito</p>
          <p className="font-mono text-lg font-bold text-slate-900">
            {formatCOP(data.movimiento.valor)}
          </p>
          {data.movimiento.concepto && (
            <p className="mt-2 line-clamp-3 text-[10px] italic text-slate-500">
              {data.movimiento.concepto}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold text-slate-700">
            Detalles hermanos ({data.movimiento.detallesHermanos.length})
          </h3>
          <ul className="space-y-1">
            {data.movimiento.detallesHermanos.map((h) => (
              <li
                key={h.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2 py-1 text-[10px]',
                  h.esEsteDetalle ? 'border-brand-blue/40 bg-brand-blue/5' : 'border-slate-100',
                )}
              >
                <span className="flex-1 truncate">{h.nombreCompleto}</span>
                <span className="font-mono text-slate-500">{formatCOP(h.totalPagar)}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[9px] font-medium ring-1 ring-inset',
                    DET_ESTADO_TONE[h.estado] ?? '',
                  )}
                >
                  {DET_ESTADO_LABEL[h.estado] ?? h.estado}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
