'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PreviewRow } from './actions';

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

const CONCEPTO_ORDER: Record<string, number> = {
  EPS: 1,
  AFP: 2,
  FSP: 3, // debajo de AFP
  ARL: 4,
  CCF: 5,
  SENA: 6,
  ICBF: 7,
  ADMIN: 8,
  SERVICIO: 9,
};

export function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="w-10 px-3 py-2"></th>
            <th className="px-3 py-2">Cotizante</th>
            <th className="px-3 py-2">Empresa</th>
            <th className="px-3 py-2">Modalidad</th>
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2 text-right">IBC</th>
            <th className="px-3 py-2 text-right">Días</th>
            <th className="px-3 py-2 text-right">Valor SGSS</th>
            <th className="px-3 py-2 text-right">Admón</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const isOpen = expanded.has(r.afiliacionId);
            return (
              <Fragment key={r.afiliacionId}>
                <tr className={cn(isOpen && 'bg-slate-50/50')}>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggle(r.afiliacionId)}
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
                  <td className="px-3 py-2.5 text-xs">
                    {r.empresaNombre ?? (
                      <span className="italic text-slate-400">Independiente</span>
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
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        r.tipo === 'VINCULACION'
                          ? 'bg-violet-50 text-violet-700'
                          : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {r.tipo === 'VINCULACION' ? 'Vinculación' : 'Mensualidad'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {copFmt.format(r.ibc)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {r.diasCotizados}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {copFmt.format(r.totalSgss)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {copFmt.format(r.totalAdmon + r.totalServicios)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold">
                    {copFmt.format(r.totalGeneral)}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-slate-50/30">
                    <td colSpan={10} className="px-3 py-3">
                      <div className="ml-10">
                        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Desglose por concepto
                        </h4>
                        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                          <table className="w-full text-xs">
                            <thead className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                              <tr>
                                <th className="px-3 py-1.5">Concepto</th>
                                <th className="px-3 py-1.5">Subconcepto</th>
                                <th className="px-3 py-1.5 text-right">%</th>
                                <th className="px-3 py-1.5 text-right">Valor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {[...r.conceptos]
                                .sort(
                                  (a, b) =>
                                    (CONCEPTO_ORDER[a.concepto] ?? 99) -
                                    (CONCEPTO_ORDER[b.concepto] ?? 99),
                                )
                                .map((c, i) => {
                                  const isFsp = c.concepto === 'FSP';
                                  return (
                                    <tr
                                      key={i}
                                      className={cn(isFsp && 'bg-amber-50/40')}
                                    >
                                      <td className="px-3 py-1.5 font-medium">
                                        {isFsp ? (
                                          <span className="ml-4 text-amber-700">
                                            ↳ {c.concepto}
                                          </span>
                                        ) : (
                                          c.concepto
                                        )}
                                      </td>
                                      <td className="px-3 py-1.5 text-slate-600">
                                        {c.subconcepto ?? '—'}
                                        {c.observaciones && (
                                          <p className="text-[10px] text-slate-400">
                                            {c.observaciones}
                                          </p>
                                        )}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-mono text-slate-600">
                                        {pctFmt(c.porcentaje)}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-mono font-semibold">
                                        {copFmt.format(c.valor)}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
