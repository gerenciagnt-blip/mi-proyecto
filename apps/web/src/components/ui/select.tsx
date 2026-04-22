import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Select nativo estilizado para alinear con `<Input />`.
 *
 * Prioridad a `<select>` nativo (accesibilidad por teclado, móvil, reader)
 * sobre un dropdown custom. El chevron se superpone en :after con SVG.
 *
 * Uso:
 *   <Select>
 *     <option value="a">Uno</option>
 *     <option value="b">Dos</option>
 *   </Select>
 */

const selectVariants = cva(
  'flex w-full appearance-none rounded-xl border border-brand-border bg-brand-surface pl-3.5 pr-9 text-brand-text-primary shadow-sm transition-all duration-200 placeholder:text-brand-text-muted focus-visible:border-brand-blue focus-visible:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue/15 disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      size: {
        sm: 'h-9 text-sm',
        md: 'h-10 text-base sm:text-sm',
        lg: 'h-12 text-base sm:text-sm',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof selectVariants> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(selectVariants({ size }), className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-text-muted" />
      </div>
    );
  },
);
Select.displayName = 'Select';
