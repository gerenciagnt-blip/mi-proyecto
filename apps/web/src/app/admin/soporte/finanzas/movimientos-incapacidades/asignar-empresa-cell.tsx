'use client';

/**
 * Sprint Soporte reorg — Selector inline para asignar empresa planilla
 * a un movimiento bancario directamente desde la tabla. Permite cambiar
 * o desasignar.
 */

import { useState, useTransition } from 'react';
import { Building2, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { asignarEmpresaMovimientoAction } from './actions';

export type EmpresaOpt = { id: string; nit: string; nombre: string };

export function AsignarEmpresaCell({
  movimientoId,
  actual,
  empresas,
}: {
  movimientoId: string;
  actual: { id: string; nombre: string; nit: string } | null;
  empresas: EmpresaOpt[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(actual);

  function asignar(empresaId: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await asignarEmpresaMovimientoAction(movimientoId, empresaId);
      if (res.error) {
        setError(res.error);
        return;
      }
      const nueva = empresaId ? (empresas.find((e) => e.id === empresaId) ?? null) : null;
      setCurrent(nueva);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium transition',
          current
            ? 'border-slate-200 bg-white text-slate-700 hover:border-brand-blue'
            : 'border-dashed border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400',
        )}
        title={current ? `${current.nombre} (NIT ${current.nit})` : 'Sin asignar'}
      >
        <Building2 className="h-3 w-3" />
        <span className="max-w-[140px] truncate">
          {current ? current.nombre : 'Asignar empresa'}
        </span>
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <select
        defaultValue={current?.id ?? ''}
        disabled={pending}
        onChange={(e) => asignar(e.target.value || null)}
        autoFocus
        onBlur={() => !pending && setEditing(false)}
        className="h-7 max-w-[180px] rounded-md border border-slate-300 bg-white px-2 text-[10px]"
      >
        <option value="">— Sin empresa —</option>
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nombre} ({e.nit})
          </option>
        ))}
      </select>
      {pending && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-slate-400 hover:text-slate-700"
        title="Cancelar"
      >
        <X className="h-3 w-3" />
      </button>
      {error && (
        <span className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] text-red-700">{error}</span>
      )}
    </div>
  );
}
