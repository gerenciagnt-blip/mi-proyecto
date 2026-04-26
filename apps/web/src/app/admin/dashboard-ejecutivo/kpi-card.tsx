import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tarjeta de KPI con valor grande, etiqueta, ícono y delta opcional vs
 * período anterior. El delta se colorea según dirección y según si más
 * = mejor o más = peor (ej. "cartera pendiente" baja es bueno).
 */
export function KpiCard({
  label,
  valor,
  icon: Icon,
  deltaPct,
  /** True si subir es algo bueno (ej. facturación). False si bajar es bueno (ej. cartera pendiente). */
  invertirSemantica = false,
  formato = 'numero',
  sub,
  tone = 'default',
}: {
  label: string;
  valor: number;
  icon: LucideIcon;
  deltaPct?: number | null;
  invertirSemantica?: boolean;
  formato?: 'numero' | 'cop' | 'dias';
  sub?: string;
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'success';
}) {
  const valorStr =
    formato === 'cop'
      ? new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          maximumFractionDigits: 0,
        }).format(valor)
      : formato === 'dias'
        ? `${valor}d`
        : valor.toLocaleString('es-CO');

  const toneClass = {
    default: 'border-slate-200',
    primary: 'border-brand-blue/30',
    warning: 'border-amber-200',
    danger: 'border-red-200',
    success: 'border-emerald-200',
  }[tone];

  const iconClass = {
    default: 'bg-slate-100 text-slate-600',
    primary: 'bg-brand-blue/10 text-brand-blue-dark',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
    success: 'bg-emerald-50 text-emerald-700',
  }[tone];

  return (
    <div className={cn('rounded-xl border bg-white p-5 shadow-sm', toneClass)}>
      <div className="flex items-start justify-between">
        <div
          className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg', iconClass)}
        >
          <Icon className="h-4 w-4" />
        </div>
        {deltaPct !== undefined && deltaPct !== null && (
          <DeltaBadge pct={deltaPct} invertir={invertirSemantica} />
        )}
        {deltaPct === null && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
            title="No hay datos del período anterior para comparar"
          >
            <Minus className="h-3 w-3" />
            sin comp.
          </span>
        )}
      </div>
      <p className="mt-4 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-slate-900">
        {valorStr}
      </p>
      {sub && <p className="mt-1 text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

function DeltaBadge({ pct, invertir }: { pct: number; invertir: boolean }) {
  const subio = pct > 0;
  const bajo = pct < 0;
  const igual = pct === 0;
  // "esBueno": ¿esta dirección es positiva para el negocio?
  const esBueno = invertir ? bajo : subio;
  const esMalo = invertir ? subio : bajo;

  if (igual) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
        <Minus className="h-3 w-3" />
        0%
      </span>
    );
  }

  const Icon = subio ? TrendingUp : TrendingDown;
  const tone = esBueno
    ? 'bg-emerald-50 text-emerald-700'
    : esMalo
      ? 'bg-red-50 text-red-700'
      : 'bg-slate-100 text-slate-600';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        tone,
      )}
      title="Cambio respecto al período anterior"
    >
      <Icon className="h-3 w-3" />
      {pct > 0 ? '+' : ''}
      {pct}%
    </span>
  );
}
