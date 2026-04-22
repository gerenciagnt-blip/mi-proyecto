import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Select nativo estilizado, alineado visualmente con <Input />.
 *
 * Prioridad a `<select>` nativo (accesibilidad por teclado, móvil, reader)
 * sobre un dropdown custom. El chevron se superpone como ícono absoluto.
 */
const selectVariants = cva(
  'flex w-full appearance-none pr-9 text-brand-text-primary transition-all duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70',
  {
    variants: {
      tone: {
        admin:
          'rounded-lg border border-slate-300 bg-white shadow-sm focus-visible:border-brand-blue focus-visible:ring-[3px] focus-visible:ring-brand-blue/15',
        glass:
          'rounded-xl border border-brand-border bg-brand-surface shadow-sm focus-visible:border-brand-blue focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-brand-blue/15',
      },
      size: {
        sm: 'h-9 pl-3 text-sm',
        md: 'h-10 pl-3 text-sm',
        lg: 'h-12 pl-4 text-base sm:text-sm',
      },
    },
    defaultVariants: { tone: 'admin', size: 'md' },
  },
);

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof selectVariants> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, tone, size, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(selectVariants({ tone, size }), className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
    );
  },
);
Select.displayName = 'Select';
