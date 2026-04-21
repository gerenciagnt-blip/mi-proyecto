'use client';

import { Fragment, useState, useTransition } from 'react';
import { ChevronDown, ChevronRight, Send, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  marcarComprobanteEmitidoAction,
  anularComprobanteAction,
} from '../actions';

export type ComprobanteRow = {
  id: string;
  consecutivo: string;
  tipo: 'AFILIACION' | 'MENSUALIDAD';
  agrupacion: 'INDIVIDUAL' | 'EMPRESA_CC' | 'ASESOR_COMERCIAL';
  destinatario: string; // nombre del cotizante / razón social CC / asesor
  destinatarioSub?: string; // documento / NIT / código
  totalEmpleador: number;
  totalTrabajador: number;
  totalGeneral: number;
  estado: 'BORRADOR' | 'EMITIDO' | 'PAGADO' | 'ANULADO';
  observaciones: string | null;
  liquidaciones: Array<{
    id: string;
    tipo: 'VINCULACION' | 'MENSUALIDAD';
    diasCotizados: number;
    ibc: number;
    totalGeneral: number;
    cotizante: { nombreCompleto: string; numeroDocumento: string };
  }>;
};

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function ComprobantesTable({ rows }: { rows: ComprobanteRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
        <p className="text-sm text-slate-500">
          Sin comprobantes — corre <strong>Generar comprobantes</strong> arriba.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="w-10 px-3 py-2"></th>
            <th className="px-3 py-2">Consecutivo</th>
            <th className="px-3 py-2">Destinatario</th>
            <th className="px-3 py-2 text-right">Liqs.</th>
            <th className="px-3 py-2 text-right">Empleador</th>
            <th className="px-3 py-2 text-right">Trabajador</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const isOpen = expanded.has(r.id);
            return (
              <Fragment key={r.id}>
                <Row r={r} isOpen={isOpen} onToggle={() => toggle(r.id)} />
                {isOpen && <Detalle r={r} />}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  r,
  isOpen,
  onToggle,
}: {
  r: ComprobanteRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [pendingEmitir, startEmitir] = useTransition();
  const [pendingAnular, startAnular] = useTransition();

  const onEmitir = () =>
    startEmitir(async () => {
      await marcarComprobanteEmitidoAction(r.id);
    });

  const onAnular = () =>
    startAnular(async () => {
      if (confirm('¿Anular este comprobante? Esta acción no se puede deshacer.')) {
        await anularComprobanteAction(r.id);
      }
    });

  const editable = r.estado !== 'PAGADO' && r.estado !== 'ANULADO';

  return (
    <tr className={cn(isOpen && 'bg-slate-50/50')}>
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
          title={isOpen ? 'Ocultar' : 'Ver liquidaciones'}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </td>
      <td className="px-3 py-2.5 font-mono text-xs font-medium">{r.consecutivo}</td>
      <td className="px-3 py-2.5">
        <p className="font-medium">{r.destinatario}</p>
        {r.destinatarioSub && (
          <p className="font-mono text-[11px] text-slate-500">{r.destinatarioSub}</p>
        )}
        {r.observaciones && (
          <p className="mt-0.5 text-[10px] italic text-amber-700">{r.observaciones}</p>
        )}
      </td>
      <td className="px-3 py-2.5 text-right text-xs">{r.liquidaciones.length}</td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        {copFmt.format(r.totalEmpleador)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        {copFmt.format(r.totalTrabajador)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold">
        {copFmt.format(r.totalGeneral)}
      </td>
      <td className="px-3 py-2.5">
        <EstadoChip estado={r.estado} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex justify-end gap-1">
          {editable && (
            <>
              <button
                type="button"
                onClick={onEmitir}
                disabled={pendingEmitir}
                title={r.estado === 'BORRADOR' ? 'Marcar emitido' : 'Devolver a borrador'}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded disabled:opacity-50',
                  r.estado === 'BORRADOR'
                    ? 'text-brand-blue hover:bg-brand-blue/10'
                    : 'text-slate-500 hover:bg-slate-100',
                )}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onAnular}
                disabled={pendingAnular}
                title="Anular"
                className="flex h-7 w-7 items-center justify-center rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function Detalle({ r }: { r: ComprobanteRow }) {
  return (
    <tr className="bg-slate-50/30">
      <td colSpan={9} className="px-3 py-3">
        <div className="ml-10">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Liquidaciones incluidas ({r.liquidaciones.length})
          </h4>
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-1.5">Cotizante</th>
                  <th className="px-3 py-1.5">Tipo</th>
                  <th className="px-3 py-1.5 text-right">Días</th>
                  <th className="px-3 py-1.5 text-right">IBC</th>
                  <th className="px-3 py-1.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.liquidaciones.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-1.5">
                      <p className="font-medium">{l.cotizante.nombreCompleto}</p>
                      <p className="font-mono text-[10px] text-slate-500">
                        {l.cotizante.numeroDocumento}
                      </p>
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          l.tipo === 'VINCULACION'
                            ? 'bg-violet-50 text-violet-700'
                            : 'bg-slate-100 text-slate-600',
                        )}
                      >
                        {l.tipo === 'VINCULACION' ? 'Vinc.' : 'Mens.'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{l.diasCotizados}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{copFmt.format(l.ibc)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">
                      {copFmt.format(l.totalGeneral)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

function EstadoChip({ estado }: { estado: ComprobanteRow['estado'] }) {
  const map: Record<ComprobanteRow['estado'], { cls: string; dot: string; label: string }> = {
    BORRADOR: {
      cls: 'bg-slate-100 text-slate-600 ring-slate-200',
      dot: 'bg-slate-400',
      label: 'Borrador',
    },
    EMITIDO: {
      cls: 'bg-sky-50 text-sky-700 ring-sky-200',
      dot: 'bg-sky-500',
      label: 'Emitido',
    },
    PAGADO: {
      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      dot: 'bg-emerald-500',
      label: 'Pagado',
    },
    ANULADO: {
      cls: 'bg-red-50 text-red-700 ring-red-200',
      dot: 'bg-red-500',
      label: 'Anulado',
    },
  };
  const m = map[estado];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        m.cls,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}
