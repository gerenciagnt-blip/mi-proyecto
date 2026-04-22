import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Input estándar del admin: sobrio, bg blanco, borde gris claro, rounded-lg.
 * Esta es la línea gráfica validada para formularios densos (empresa planilla,
 * catálogos, cuentas de cobro, etc.).
 *
 * Para pantallas de onboarding (login) se usa `tone="glass"` que mantiene el
 * look azulado con `bg-brand-surface` y bordes redondeados más pronunciados.
 */
const inputVariants = cva(
  'flex w-full text-brand-text-primary transition-all duration-200 placeholder:text-slate-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70',
  {
    variants: {
      tone: {
        admin:
          'rounded-lg border border-slate-300 bg-white shadow-sm focus-visible:border-brand-blue focus-visible:ring-[3px] focus-visible:ring-brand-blue/15',
        glass:
          'rounded-xl border border-brand-border bg-brand-surface shadow-sm focus-visible:border-brand-blue focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-brand-blue/15',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-3 text-sm',
        lg: 'h-12 px-4 text-base sm:text-sm',
      },
    },
    defaultVariants: { tone: 'admin', size: 'md' },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /** Ícono decorativo a la izquierda */
  icon?: LucideIcon;
  /** Elemento personalizado a la derecha (ej. toggle show/hide password) */
  trailing?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon: Icon, trailing, tone, size, ...props }, ref) => {
    const hasIcon = !!Icon;
    const hasTrailing = !!trailing;

    return (
      <div className="relative">
        {hasIcon && Icon && (
          <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            inputVariants({ tone, size }),
            hasIcon && 'pl-10',
            hasTrailing && 'pr-10',
            className,
          )}
          {...props}
        />
        {hasTrailing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
