import { cn } from '@/lib/utils';

/**
 * Logo textual de Sistema PILA según brandbook.
 * Usa Montserrat + gradiente blue → green en "PILA".
 *
 * Cuando exista `apps/web/public/logo.png` usar <PilaLogoImg /> en su lugar.
 */
export function PilaLogo({
  size = 'md',
  showSlogan = true,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  showSlogan?: boolean;
  className?: string;
}) {
  const sizes = {
    sm: { title: 'text-xl', slogan: 'text-[10px]', gap: 'gap-0.5' },
    md: { title: 'text-3xl', slogan: 'text-xs', gap: 'gap-1' },
    lg: { title: 'text-5xl', slogan: 'text-sm', gap: 'gap-2' },
  } as const;
  const s = sizes[size];

  return (
    <div className={cn('flex flex-col items-center', s.gap, className)}>
      <h1
        className={cn(
          'font-heading font-extrabold tracking-tight leading-none',
          s.title,
        )}
      >
        <span className="text-brand-gray-dark">SISTEMA </span>
        <span className="bg-brand-gradient-h bg-clip-text text-transparent">
          PILA
        </span>
      </h1>
      {showSlogan && (
        <p className={cn('text-brand-gray-light italic', s.slogan)}>
          Tu seguridad social a un click
        </p>
      )}
    </div>
  );
}
