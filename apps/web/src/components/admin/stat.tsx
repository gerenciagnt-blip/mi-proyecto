import { cn } from '@/lib/utils';

/**
 * Tarjeta compacta para KPIs en encabezados de módulos (cuadre, cartera,
 * historial). Extraída del cuadre donde estaba definida inline.
 *
 * - `mono` aplica font-mono al valor (por default true — para números).
 * - `tone` modifica solo el color del valor.
 * - `highlight` aumenta el tamaño del valor (el "hero" del set).
 */
export function Stat({
  label,
  value,
  sub,
  mono = true,
  tone = 'slate',
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  tone?: 'slate' | 'emerald' | 'red' | 'blue' | 'amber';
  highlight?: boolean;
}) {
  const toneCls = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    blue: 'text-brand-blue-dark',
    amber: 'text-amber-700',
  }[tone];

  return (
    <div className="p-5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-xl font-bold tracking-tight',
          mono && 'font-mono',
          toneCls,
          highlight && 'text-2xl',
        )}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>
      )}
    </div>
  );
}
