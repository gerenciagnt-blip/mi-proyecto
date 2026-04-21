import { cn } from '@/lib/utils';

function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-11 w-11 text-sm',
  } as const;

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-brand-gradient-h text-white font-semibold shadow-sm',
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {initialsOf(name) || '?'}
    </div>
  );
}
