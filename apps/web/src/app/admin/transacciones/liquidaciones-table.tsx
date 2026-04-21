'use client';

import { Fragment, useState, useTransition } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Check, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  recalcularLiquidacionAction,
  marcarRevisadaAction,
} from './actions';

type Concepto = {
  id: string;
  concepto: string;
  subconcepto: string | null;
  base: number;
  porcentaje: number;
  valor: number;
  aCargoEmpleador: boolean;
  observaciones: string | null;
};

export type LiquidacionRow = {
  id: string;
  afiliacionId: string;
  estado: 'BORRADOR' | 'REVISADA' | 'PAGADA' | 'ANULADA';
  ibc: number;
  totalEmpleador: number;
  totalTrabajador: number;
  totalGeneral: number;
  calculadoEn: string;
  cotizante: {
    tipoDocumento: string;
    numeroDocumento: string;
    nombreCompleto: string;
  };
  empresa: { nombre: string } | null;
  modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
  nivelRiesgo: string;
  conceptos: Concepto[];
};

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

export function LiquidacionesTable({
  rows,
  periodoCerrado,
}: {
  rows: LiquidacionRow[];
  periodoCerrado: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
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
          Sin liquidaciones — corre el botón <strong>Liquidar período</strong> arriba para
          generarlas.
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
            <th className="px-3 py-2">Cotizante</th>
            <th className="px-3 py-2">Empresa</th>
            <th className="px-3 py-2">Modalidad</th>
            <th className="px-3 py-2 text-right">IBC</th>
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
                <Row
                  r={r}
                  isOpen={isOpen}
                  onToggle={() => toggleExpand(r.id)}
                  periodoCerrado={periodoCerrado}
                />
                {isOpen && <DetalleRow r={r} />}
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
  periodoCerrado,
}: {
  r: LiquidacionRow;
  isOpen: boolean;
  onToggle: () => void;
  periodoCerrado: boolean;
}) {
  const [pendingRecalc, startRecalc] = useTransition();
  const [pendingToggle, startToggle] = useTransition();

  const onRecalc = () =>
    startRecalc(async () => {
      await recalcularLiquidacionAction(r.id);
    });

  const onToggleRevisada = () =>
    startToggle(async () => {
      await marcarRevisadaAction(r.id, r.estado === 'BORRADOR');
    });

  const puedeEditarse = !periodoCerrado && r.estado !== 'PAGADA' && r.estado !== 'ANULADA';

  return (
    <tr className={cn(isOpen && 'bg-slate-50/50')}>
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
          title={isOpen ? 'Ocultar desglose' : 'Ver desglose'}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </td>
      <td className="px-3 py-2.5">
        <p className="font-medium">{r.cotizante.nombreCompleto}</p>
        <p className="font-mono text-[11px] text-slate-500">
          {r.cotizante.tipoDocumento} {r.cotizante.numeroDocumento}
        </p>
      </td>
      <td className="px-3 py-2.5">
        {r.empresa ? (
          <span className="text-xs">{r.empresa.nombre}</span>
        ) : (
          <span className="text-xs italic text-slate-400">Independiente</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium',
            r.modalidad === 'DEPENDIENTE'
              ? 'bg-sky-100 text-sky-700'
              : 'bg-amber-100 text-amber-700',
          )}
        >
          {r.modalidad === 'DEPENDIENTE' ? 'Dep.' : 'Indep.'}
        </span>
        <span className="ml-2 font-mono text-[10px] text-slate-500">{r.nivelRiesgo}</span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">{copFmt.format(r.ibc)}</td>
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
          {puedeEditarse && (
            <>
              <button
                type="button"
                onClick={onRecalc}
                disabled={pendingRecalc}
                title="Recalcular"
                className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', pendingRecalc && 'animate-spin')} />
              </button>
              <button
                type="button"
                onClick={onToggleRevisada}
                disabled={pendingToggle}
                title={r.estado === 'BORRADOR' ? 'Marcar revisada' : 'Devolver a borrador'}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded disabled:opacity-50',
                  r.estado === 'BORRADOR'
                    ? 'text-emerald-600 hover:bg-emerald-50'
                    : 'text-slate-500 hover:bg-slate-100',
                )}
              >
                {r.estado === 'BORRADOR' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Undo2 className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function DetalleRow({ r }: { r: LiquidacionRow }) {
  return (
    <tr className="bg-slate-50/30">
      <td colSpan={10} className="px-3 py-3">
        <div className="ml-10">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Desglose por concepto
          </h4>
          {r.conceptos.length === 0 ? (
            <p className="text-xs text-slate-400">Sin conceptos calculados.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <table className="w-full text-xs">
                <thead className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-1.5">Concepto</th>
                    <th className="px-3 py-1.5">Subconcepto</th>
                    <th className="px-3 py-1.5 text-right">Base</th>
                    <th className="px-3 py-1.5 text-right">%</th>
                    <th className="px-3 py-1.5 text-right">Valor</th>
                    <th className="px-3 py-1.5">A cargo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.conceptos.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-1.5 font-medium">{c.concepto}</td>
                      <td className="px-3 py-1.5 text-slate-600">
                        {c.subconcepto ?? '—'}
                        {c.observaciones && (
                          <p className="text-[10px] text-slate-400">{c.observaciones}</p>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {copFmt.format(c.base)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {pctFmt(c.porcentaje)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold">
                        {copFmt.format(c.valor)}
                      </td>
                      <td className="px-3 py-1.5 text-[10px]">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 font-medium',
                            c.aCargoEmpleador
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'bg-emerald-50 text-emerald-700',
                          )}
                        >
                          {c.aCargoEmpleador ? 'Empleador' : 'Trabajador'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function EstadoChip({ estado }: { estado: LiquidacionRow['estado'] }) {
  const map: Record<LiquidacionRow['estado'], { cls: string; dot: string; label: string }> = {
    BORRADOR: {
      cls: 'bg-slate-100 text-slate-600 ring-slate-200',
      dot: 'bg-slate-400',
      label: 'Borrador',
    },
    REVISADA: {
      cls: 'bg-sky-50 text-sky-700 ring-sky-200',
      dot: 'bg-sky-500',
      label: 'Revisada',
    },
    PAGADA: {
      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      dot: 'bg-emerald-500',
      label: 'Pagada',
    },
    ANULADA: {
      cls: 'bg-red-50 text-red-700 ring-red-200',
      dot: 'bg-red-500',
      label: 'Anulada',
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
