import { Building2, User } from 'lucide-react';
import type { EstadoPlanilla } from '@pila/db';
import { cn } from '@/lib/utils';
import { TIPO_PLANILLA_LABEL, ESTADO_LABEL } from '../_helpers';

/** Tarjeta chica con un número grande (KPI). */
export function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

/** Pill que muestra el tipo de planilla PILA (E/I/Y/N/K/A/S). */
export function TipoBadge({ tipo }: { tipo: string }) {
  const label = TIPO_PLANILLA_LABEL[tipo] ?? tipo;
  const isE = tipo === 'E';
  const Icon = isE ? Building2 : User;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        isE
          ? 'bg-sky-50 text-sky-700 ring-sky-200'
          : 'bg-violet-50 text-violet-700 ring-violet-200',
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="font-mono font-bold">{tipo}</span>
      <span>·</span>
      <span>{label}</span>
    </span>
  );
}

/** Pill que muestra el estado de la planilla (CONSOLIDADO/PAGADA/ANULADA). */
export function EstadoBadge({ estado }: { estado: EstadoPlanilla }) {
  const map = {
    CONSOLIDADO: 'bg-amber-50 text-amber-700 ring-amber-200',
    PAGADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    ANULADA: 'bg-red-50 text-red-700 ring-red-200',
  }[estado];
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        map,
      )}
    >
      {ESTADO_LABEL[estado]}
    </span>
  );
}
