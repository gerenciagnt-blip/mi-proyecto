import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Ícono decorativo a la izquierda */
  icon?: LucideIcon;
  /** Elemento personalizado a la derecha (ej. toggle show/hide password) */
  trailing?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon: Icon, trailing, ...props }, ref) => {
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
            'flex h-12 w-full rounded-xl border border-brand-border bg-brand-surface px-4 text-sm text-brand-text-primary shadow-sm transition-all duration-200 placeholder:text-brand-text-muted focus-visible:border-brand-blue focus-visible:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue/15 disabled:cursor-not-allowed disabled:opacity-60',
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
