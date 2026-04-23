'use client';

import { useState, useTransition } from 'react';
import { Eye, Download, Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { anularTransaccionAction } from '../nueva-transaccion/actions';

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const pctFmt = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n) + '%';

const FORMA_PAGO_LABEL: Record<string, string> = {
  POR_CONFIGURACION: 'Por configuración',
  CONSOLIDADO: 'Consolidado',
  POR_MEDIO_PAGO: 'Medio de pago',
};

export type HistorialRowData = {
  id: string;
  consecutivo: string;
  numeroComprobanteExt: string | null;
  numeroPlanilla: string | null;
  tipo: 'AFILIACION' | 'MENSUALIDAD';
  agrupacion: 'INDIVIDUAL' | 'EMPRESA_CC' | 'ASESOR_COMERCIAL';
  tipoLabel: string;
  agrupacionLabel: string;
  periodoLabel: string;
  periodoAporteLabel: string | null;
  fechaPago: string | null;
  procesadoEn: string | null;
  destinatario: string;
  destinatarioSub: string | null;
  formaPago: string | null;
  medioPago: { codigo: string; nombre: string } | null;
  totalSgss: number;
  totalAdmon: number;
  totalServicios: number;
  totalGeneral: number;
  estado: 'BORRADOR' | 'EMITIDO' | 'PAGADO' | 'ANULADO';
  aplicaNovedadRetiro: boolean;
  valorAdminOverride: number | null;
  estadoDerivado: 'EN_PROCESO' | 'PROCESADO' | 'ANULADO';
  conceptos: Array<{
    concepto: string;
    subconcepto: string | null;
    porcentaje: number;
    valor: number;
  }>;
  /** Planillas activas (no anuladas) que contienen este comprobante.
   * Un comprobante de Resolución EPS+ARL puede estar en 2 planillas (E+K). */
  planillas: Array<{
    consecutivo: string;
    tipoPlanilla: 'E' | 'I' | 'Y' | 'K' | 'N' | 'A' | 'S';
    estado: 'CONSOLIDADO' | 'PAGADA' | 'ANULADA';
    numeroPlanillaExt: string | null;
  }>;
};

export function HistorialRow({ row }: { row: HistorialRowData }) {
  const [consultarOpen, setConsultarOpen] = useState(false);
  const [anularOpen, setAnularOpen] = useState(false);
  const anulado = row.estadoDerivado === 'ANULADO';

  return (
    <tr
      className={cn(
        'transition',
        anulado ? 'bg-red-50/50 text-slate-400 line-through' : undefined,
      )}
    >
      <td className="px-4 py-2.5 font-mono text-xs font-medium">
        {row.consecutivo}
        {row.numeroComprobanteExt && (
          <p className="text-[10px] text-slate-500 no-underline">
            Ext: {row.numeroComprobanteExt}
          </p>
        )}
      </td>
      <td className="px-4 py-2.5 font-mono text-xs">{row.periodoLabel}</td>
      <td className="px-4 py-2.5 text-xs">
        <p>{row.tipoLabel}</p>
        <p className="text-[10px] text-slate-500 no-underline">{row.agrupacionLabel}</p>
      </td>
      <td className="px-4 py-2.5">
        <p className="font-medium no-underline">{row.destinatario}</p>
        {row.destinatarioSub && (
          <p className="font-mono text-[10px] text-slate-500 no-underline">
            {row.destinatarioSub}
          </p>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs">
        {row.formaPago ? FORMA_PAGO_LABEL[row.formaPago] ?? row.formaPago : '—'}
        {row.medioPago && (
          <p className="text-[10px] text-slate-500 no-underline">
            {row.medioPago.codigo} · {row.medioPago.nombre}
          </p>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{row.fechaPago ?? '—'}</td>
      <td className="px-4 py-2.5 text-right font-mono text-xs">
        {copFmt.format(row.totalSgss)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-xs">
        {copFmt.format(row.totalAdmon)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-xs">
        {copFmt.format(row.totalServicios)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">
        {copFmt.format(row.totalGeneral)}
      </td>
      <td className="px-4 py-2.5 font-mono text-xs">
        {row.numeroPlanilla ?? <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-2.5">
        <EstadoChip estado={row.estadoDerivado} />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => setConsultarOpen(true)}
            title="Consultar"
            className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          {anulado ? (
            <span
              title="Comprobante anulado — PDF no disponible"
              className="flex h-7 w-7 cursor-not-allowed items-center justify-center rounded text-slate-300"
            >
              <Download className="h-3.5 w-3.5" />
            </span>
          ) : (
            <a
              href={`/api/comprobantes/${row.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              title="Duplicado PDF"
              className="flex h-7 w-7 items-center justify-center rounded text-brand-blue hover:bg-brand-blue/10 hover:text-brand-blue-dark"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}
          {!anulado && (
            <button
              type="button"
              onClick={() => setAnularOpen(true)}
              title="Anular"
              className="flex h-7 w-7 items-center justify-center rounded text-red-600 hover:bg-red-50"
            >
              <Ban className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>

      {consultarOpen && (
        <ConsultarDialog
          row={row}
          open={consultarOpen}
          onClose={() => setConsultarOpen(false)}
        />
      )}
      {anularOpen && (
        <AnularDialog
          row={row}
          open={anularOpen}
          onClose={() => setAnularOpen(false)}
        />
      )}
    </tr>
  );
}

// ========== Consultar ==========

function ConsultarDialog({
  row,
  open,
  onClose,
}: {
  row: HistorialRowData;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Transacción ${row.consecutivo}`}
      description={`${row.tipoLabel} · ${row.agrupacionLabel} · Período ${row.periodoLabel}`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Destinatario */}
        <section className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            Destinatario
          </p>
          <p className="mt-0.5 font-medium text-slate-900">{row.destinatario}</p>
          {row.destinatarioSub && (
            <p className="font-mono text-xs text-slate-500">{row.destinatarioSub}</p>
          )}
        </section>

        {/* Totales */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="SGSS" value={copFmt.format(row.totalSgss)} />
          <Mini label="Admón" value={copFmt.format(row.totalAdmon)} />
          <Mini label="Servicios" value={copFmt.format(row.totalServicios)} />
          <Mini label="Total" value={copFmt.format(row.totalGeneral)} highlight />
        </section>

        {/* Desglose */}
        {row.conceptos.length > 0 && (
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Desglose por concepto
            </p>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-1.5">Concepto</th>
                    <th className="px-3 py-1.5">Subconcepto</th>
                    <th className="px-3 py-1.5 text-right">%</th>
                    <th className="px-3 py-1.5 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {row.conceptos.map((c, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-medium">{c.concepto}</td>
                      <td className="px-3 py-1.5 text-slate-600">
                        {c.subconcepto ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-600">
                        {pctFmt(c.porcentaje)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold">
                        {copFmt.format(c.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Detalle de transacción */}
        <section className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Detalle
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Info label="Consecutivo" value={row.consecutivo} mono />
            <Info label="Número externo" value={row.numeroComprobanteExt ?? '—'} mono />
            <Info
              label="Forma de pago"
              value={
                (row.formaPago && FORMA_PAGO_LABEL[row.formaPago]) ??
                row.formaPago ??
                '—'
              }
            />
            {row.medioPago && (
              <Info
                label="Medio de pago"
                value={`${row.medioPago.codigo} · ${row.medioPago.nombre}`}
              />
            )}
            <Info label="Fecha de pago" value={row.fechaPago ?? '—'} />
            <Info label="Procesado" value={row.procesadoEn ?? '—'} />
            <Info label="N° planilla (operador)" value={row.numeroPlanilla ?? '—'} mono />
            {row.planillas.length > 0 && (
              <Info
                label={row.planillas.length === 1 ? 'Planilla' : 'Planillas'}
                value={
                  <div className="flex flex-wrap gap-1">
                    {row.planillas.map((p) => (
                      <span
                        key={p.consecutivo}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          p.estado === 'PAGADA'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-amber-50 text-amber-700 ring-amber-200',
                        )}
                        title={`${p.consecutivo} · ${p.estado === 'PAGADA' ? 'Pagada' : 'Guardada'}`}
                      >
                        <span className="font-mono font-bold">{p.tipoPlanilla}</span>
                        <span>·</span>
                        <span className="font-mono">{p.consecutivo}</span>
                        <span>·</span>
                        <span>{p.estado === 'PAGADA' ? 'Pagada' : 'Guardada'}</span>
                      </span>
                    ))}
                  </div>
                }
              />
            )}
            {row.periodoAporteLabel && (
              <Info
                label="Período aporte PILA"
                value={row.periodoAporteLabel}
                mono
                highlight="amber"
              />
            )}
            {row.valorAdminOverride != null && (
              <Info
                label="Admón ajustado"
                value={copFmt.format(row.valorAdminOverride)}
              />
            )}
            {row.aplicaNovedadRetiro && (
              <Info
                label="Novedad"
                value="Retiro del cotizante"
                highlight="amber"
              />
            )}
          </div>
        </section>

        <div className="flex justify-end gap-2">
          {row.estadoDerivado === 'ANULADO' ? (
            <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400">
              <Download className="h-3.5 w-3.5" />
              PDF no disponible (anulado)
            </span>
          ) : (
            <a
              href={`/api/comprobantes/${row.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Duplicado PDF
            </a>
          )}
          <Button type="button" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Mini({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 font-mono text-sm font-bold',
          highlight ? 'text-brand-blue-dark' : 'text-slate-900',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Info({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  highlight?: 'amber';
}) {
  const isText = typeof value === 'string' || typeof value === 'number';
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      {isText ? (
        <p
          className={cn(
            'mt-0.5 font-medium',
            mono && 'font-mono',
            highlight === 'amber' && 'text-amber-700',
          )}
        >
          {value}
        </p>
      ) : (
        <div className="mt-0.5">{value}</div>
      )}
    </div>
  );
}

// ========== Anular ==========

function AnularDialog({
  row,
  open,
  onClose,
}: {
  row: HistorialRowData;
  open: boolean;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onConfirm = () => {
    setError(null);
    start(async () => {
      const r = await anularTransaccionAction(row.id);
      if (r.error) setError(r.error);
      else onClose();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Anular ${row.consecutivo}`}
      description="La transacción queda en el historial marcada como Anulada y no se puede revertir."
      size="sm"
    >
      <div className="space-y-3">
        <Alert variant="warning">
          <Ban className="h-4 w-4 shrink-0" />
          <div className="text-sm">
            <p>
              Se anulará el comprobante{' '}
              <strong className="font-mono">{row.consecutivo}</strong> por{' '}
              {copFmt.format(row.totalGeneral)}.
            </p>
            {row.aplicaNovedadRetiro && (
              <p className="mt-2 text-amber-900">
                Esta factura aplicó <strong>novedad de retiro</strong>. Al anular,
                el cotizante será <strong>reactivado</strong> en base de datos.
              </p>
            )}
          </div>
        </Alert>

        {error && (
          <Alert variant="danger">
            <Ban className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Ban className="h-4 w-4" />
            )}
            {pending ? 'Anulando…' : 'Sí, anular'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ========== Estado chip ==========

function EstadoChip({
  estado,
}: {
  estado: 'EN_PROCESO' | 'PROCESADO' | 'ANULADO';
}) {
  const map = {
    EN_PROCESO: {
      cls: 'bg-sky-50 text-sky-700 ring-sky-200',
      label: 'En proceso',
    },
    PROCESADO: {
      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      label: 'Procesado',
    },
    ANULADO: {
      cls: 'bg-red-50 text-red-700 ring-red-200',
      label: 'Anulado',
    },
  };
  const m = map[estado];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset no-underline',
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
}
