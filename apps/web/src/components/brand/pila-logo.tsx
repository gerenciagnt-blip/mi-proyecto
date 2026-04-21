import { cn } from '@/lib/utils';

/**
 * Logo oficial Sistema PILA.
 * PNG servido desde /public/logo.png.
 * Usamos <img> plano (no next/image) para evitar la API de optimización
 * y ahorrarnos el procesamiento — el logo ya viene optimizado.
 */
export function PilaLogo({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Retenido por compatibilidad; ya no se usa con <img>. */
  priority?: boolean;
}) {
  const widths = { sm: 120, md: 180, lg: 260 } as const;
  const w = widths[size];

  return (
    <div className={cn('flex items-center justify-center', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Sistema PILA — Tu seguridad social a un click"
        style={{ width: `${w}px`, height: 'auto' }}
        className="max-w-full"
      />
    </div>
  );
}
