'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, X, Loader2, ListChecks, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inconsistenciasPlanillaPagosimpleAction } from '@/app/admin/planos/pagosimple-action';
import type { PayrollInconsistenciesResponse } from '@/lib/pagosimple/types';

/**
 * Botón "Ver errores" + modal con el detalle de inconsistencias UGPP de
 * una planilla específica. La consulta se hace en vivo al operador al
 * abrir el modal (no cacheamos para que refleje correcciones recientes).
 */
export function VerErroresButton({
  planillaId,
  consecutivo,
  aportante,
}: {
  planillaId: string;
  consecutivo: string;
  aportante: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startFetch] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<PayrollInconsistenciesResponse | null>(null);
  const [q, setQ] = useState('');

  function abrir() {
    setOpen(true);
    setErr(null);
    setData(null);
    setQ('');
    startFetch(async () => {
      const r = await inconsistenciasPlanillaPagosimpleAction(planillaId);
      if (r.ok) setData(r.data);
      else setErr(r.error);
    });
  }

  function cerrar() {
    setOpen(false);
  }

  function reintentar() {
    setErr(null);
    setData(null);
    startFetch(async () => {
      const r = await inconsistenciasPlanillaPagosimpleAction(planillaId);
      if (r.ok) setData(r.data);
      else setErr(r.error);
    });
  }

  // Filtra cada lista por el texto del buscador (case insensitive en
  // description, identification y row).
  const filtro = q.trim().toLowerCase();
  const filtra = <T extends { description: string; identification: string; row: string }>(
    items: T[],
  ): T[] => {
    if (!filtro) return items;
    return items.filter(
      (i) =>
        i.description.toLowerCase().includes(filtro) ||
        i.identification.toLowerCase().includes(filtro) ||
        i.row.toLowerCase().includes(filtro),
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 transition hover:bg-amber-100"
      >
        <AlertTriangle className="h-3 w-3" />
        Ver errores
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={cerrar}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between border-b border-slate-200 bg-amber-50 px-5 py-3">
              <div>
                <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-amber-900">
                  <ListChecks className="h-4 w-4" />
                  Inconsistencias de la planilla {consecutivo}
                </h3>
                <p className="mt-0.5 text-xs text-amber-700">{aportante}</p>
              </div>
              <button
                type="button"
                onClick={cerrar}
                className="rounded p-1 text-amber-700 hover:bg-amber-100"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {pending && !data && (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultando inconsistencias al operador…
                </div>
              )}

              {err && !pending && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {err}
                  </div>
                  <button
                    type="button"
                    onClick={reintentar}
                    className="rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-blue-dark"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {data && (
                <div className="space-y-4">
                  {/* Header con stats + buscador */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-3 text-xs">
                      <Stat
                        label="Errores cotizante"
                        value={data.detail_errors_contributor.length}
                        tone="red"
                      />
                      <Stat
                        label="Errores empresa"
                        value={data.detail_errors_company.length}
                        tone="red"
                      />
                      <Stat label="Warnings" value={data.detail_warnings.length} tone="amber" />
                      <Stat
                        label="Total reportado"
                        value={data.inconsistencies_number}
                        tone="slate"
                      />
                    </div>
                    <div className="relative w-full max-w-xs">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Filtrar por texto, doc o fila…"
                        className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
                      />
                    </div>
                  </div>

                  <Bloque
                    titulo="Errores · Cotizante"
                    tone="red"
                    items={filtra(data.detail_errors_contributor)}
                  />
                  <Bloque
                    titulo="Errores · Empresa"
                    tone="red"
                    items={filtra(data.detail_errors_company)}
                  />
                  <Bloque titulo="Warnings" tone="amber" items={filtra(data.detail_warnings)} />
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
              <span>
                Los datos vienen en vivo del operador — actualizan correcciones aliado/staff.
              </span>
              <button
                type="button"
                onClick={cerrar}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'red' | 'amber' | 'slate';
}) {
  const toneClass =
    tone === 'red'
      ? 'bg-red-50 text-red-700 ring-red-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-slate-50 text-slate-700 ring-slate-200';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        toneClass,
      )}
    >
      <span className="font-mono font-bold">{value}</span>
      <span className="text-[10px]">{label}</span>
    </span>
  );
}

function Bloque({
  titulo,
  tone,
  items,
}: {
  titulo: string;
  tone: 'red' | 'amber';
  items: Array<{
    description: string;
    identification: string;
    autocorrect: 'Si' | 'No';
    row: string;
    initial_position?: string;
    final_position?: string;
  }>;
}) {
  if (items.length === 0) return null;
  const headerTone = tone === 'red' ? 'text-red-700' : 'text-amber-700';
  return (
    <section>
      <h4 className={cn('mb-2 flex items-center gap-1 text-xs font-semibold', headerTone)}>
        <AlertTriangle className="h-3 w-3" />
        {titulo} ({items.length})
      </h4>
      <ul className="space-y-1.5">
        {items.map((it, idx) => (
          <li
            key={`${it.identification}-${it.row}-${idx}`}
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
          >
            <p className="text-slate-800">{it.description}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
              <span>
                Doc: <span className="font-mono">{it.identification || '—'}</span>
              </span>
              <span>
                Fila: <span className="font-mono">{it.row || '—'}</span>
              </span>
              {(it.initial_position || it.final_position) && (
                <span>
                  Pos:{' '}
                  <span className="font-mono">
                    {it.initial_position ?? '?'}-{it.final_position ?? '?'}
                  </span>
                </span>
              )}
              <span
                className={cn(
                  'ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                  it.autocorrect === 'Si'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-600',
                )}
              >
                Autocorrect: {it.autocorrect}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
