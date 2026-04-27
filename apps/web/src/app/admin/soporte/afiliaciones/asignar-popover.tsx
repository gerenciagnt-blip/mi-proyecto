'use client';

/**
 * Sprint Soporte reorg — Botón compacto que abre un popover para
 * asignar/reasignar/desasignar una solicitud SoporteAfiliacion. Se usa
 * tanto en la tabla (modo `compact`, sólo avatar/inicial) como dentro
 * del modal de detalle (modo expandido con label).
 *
 * Cualquier usuario STAFF (ADMIN o SOPORTE) puede asignar.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown, UserPlus2, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { asignarSoporteAfAction, type StaffAsignable } from './actions';

function inicialesDe(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function AsignarPopover({
  soporteAfId,
  actual,
  staff,
  compact = false,
  onAfter,
}: {
  soporteAfId: string;
  actual: { id: string; name: string } | null;
  staff: StaffAsignable[];
  compact?: boolean;
  /** Callback opcional luego de un cambio exitoso (modal lo usa para refrescar). */
  onAfter?: (nuevoAsignado: { id: string; name: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al click afuera.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function asignar(targetId: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await asignarSoporteAfAction(soporteAfId, targetId);
      if (res.error) {
        setError(res.error);
        return;
      }
      const nuevo = targetId ? (staff.find((s) => s.id === targetId) ?? null) : null;
      onAfter?.(nuevo ? { id: nuevo.id, name: nuevo.name } : null);
      setOpen(false);
    });
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={pending}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium transition hover:border-brand-blue hover:bg-brand-blue/5',
          compact ? 'min-w-[40px]' : 'min-w-[120px]',
          pending && 'opacity-60',
        )}
        title={actual ? `Asignada a ${actual.name}` : 'Sin asignar'}
      >
        {actual ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-blue/10 text-[9px] font-semibold text-brand-blue-dark">
            {inicialesDe(actual.name)}
          </span>
        ) : (
          <UserPlus2 className="h-3.5 w-3.5 text-slate-400" />
        )}
        {!compact && (
          <span className="truncate text-slate-700">{actual?.name ?? 'Sin asignar'}</span>
        )}
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
        ) : (
          <ChevronDown className="h-3 w-3 text-slate-400" />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {error && (
            <p className="mx-2 mb-1 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700">
              {error}
            </p>
          )}

          {actual && (
            <>
              <button
                type="button"
                onClick={() => asignar(null)}
                disabled={pending}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-700 hover:bg-red-50"
              >
                <X className="h-3 w-3" />
                Desasignar ({actual.name})
              </button>
              <div className="my-1 border-t border-slate-100" />
            </>
          )}

          <ul className="max-h-60 overflow-y-auto">
            {staff.length === 0 && (
              <li className="px-3 py-2 text-[11px] text-slate-400">No hay staff activo</li>
            )}
            {staff.map((u) => {
              const isCurrent = actual?.id === u.id;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => asignar(u.id)}
                    disabled={pending || isCurrent}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 disabled:cursor-not-allowed',
                      isCurrent ? 'bg-brand-blue/5 text-brand-blue-dark' : 'text-slate-700',
                    )}
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-700">
                      {inicialesDe(u.name)}
                    </span>
                    <span className="flex-1 truncate">{u.name}</span>
                    <span className="text-[9px] uppercase tracking-wider text-slate-400">
                      {u.role}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
