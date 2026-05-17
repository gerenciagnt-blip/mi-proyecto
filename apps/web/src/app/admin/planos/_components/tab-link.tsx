import Link from 'next/link';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Tab del menú superior del módulo Planos. Muestra ícono + label + count. */
export function TabLink({
  href,
  active,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium transition',
        active
          ? 'border-brand-blue text-brand-blue'
          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {count > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            active ? 'bg-brand-blue/10 text-brand-blue' : 'bg-slate-100 text-slate-600',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
