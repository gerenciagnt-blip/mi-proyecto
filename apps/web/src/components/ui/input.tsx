import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  // Base: borde, bg, transición, placeholder, focus ring, disabled.
  // `text-base` (16px) en mobile evita auto-zoom iOS; sm:text-sm lo compacta
  // en desktop (salvo en size=lg donde queremos el 16px).
  'flex w-full rounded-xl border border-brand-border bg-brand-surface text-brand-text-primary shadow-sm transition-all duration-200 placeholder:text-brand-text-muted focus-visible:border-brand-blue focus-visible:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue/15 disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      size: {
        // Tamaño compacto para tablas/filtros.
        sm: 'h-9 px-3 text-sm',
        // Default para formularios del admin.
        md: 'h-10 px-3.5 text-base sm:text-sm',
        // Tamaño grande (login, formularios de onboarding).
        lg: 'h-12 px-4 text-base sm:text-sm',
      },
    },
    defaultVariants: { size: 'md' },
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
  ({ className, type, icon: Icon, trailing, size, ...props }, ref) => {
    const hasIcon = !!Icon;
    const hasTrailing = !!trailing;

    return (
      <div className="relative">
        {hasIcon && Icon && (
          <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-text-muted" />
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            inputVariants({ size }),
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
