import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-blue text-white shadow-sm hover:bg-brand-blue-dark active:bg-brand-blue-dark',
        gradient:
          'bg-brand-gradient text-white shadow-brand hover:shadow-brand-lg hover:-translate-y-0.5 active:translate-y-0',
        secondary:
          'bg-brand-green text-white shadow-sm hover:bg-brand-green-dark',
        outline:
          'border border-brand-border bg-white text-brand-text-primary hover:bg-brand-surface',
        ghost: 'text-brand-text-primary hover:bg-brand-surface',
        danger: 'bg-danger text-white hover:bg-red-700',
        link: 'text-brand-blue underline-offset-4 hover:underline hover:text-brand-blue-dark',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
