import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Card con icono coloreado, valor destacado y descripción corta. Pensada
 * para resúmenes por concepto (cuadre de caja: SGSS / Admón / Servicios /
 * Internos). Extraída del cuadre donde estaba definida inline.
 */
export function ConceptoCard({
  icon: Icon,
  label,
  value,
  desc,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  desc: string;
  tone: 'sky' | 'violet' | 'indigo' | 'amber' | 'emerald' | 'rose';
}) {
  const toneBg = {
    sky: 'bg-sky-50 text-sky-700',
    violet: 'bg-violet-50 text-violet-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tone];
  const toneBorder = {
    sky: 'border-sky-200',
    violet: 'border-violet-200',
    indigo: 'border-indigo-200',
    amber: 'border-amber-200',
    emerald: 'border-emerald-200',
    rose: 'border-rose-200',
  }[tone];

  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-4 shadow-sm',
        toneBorder,
      )}
    >
      <div
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-lg',
          toneBg,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">{desc}</p>
    </div>
  );
}
