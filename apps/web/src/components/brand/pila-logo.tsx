import { cn } from '@/lib/utils';

/**
 * Logo oficial Sistema PILA.
 * PNG servido desde /public/logo.png (ya optimizado, por eso <img> plano
 * en lugar de next/image).
 *
 * - `size` aplica un ancho fijo (sm=120 / md=180 / lg=260 / xl=360 px).
 *   Si se omite, el tamaño se controla desde `imgClassName` con clases
 *   Tailwind responsive (ej. "w-52 md:w-72 lg:w-96").
 * - `animated` aplica la animación global `logo-animated` (float + leve
 *   hue-rotate) definida en globals.css. Respeta prefers-reduced-motion.
 */
export function PilaLogo({
  size,
  className,
  imgClassName,
  animated = false,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  imgClassName?: string;
  animated?: boolean;
  /** Retenido por compatibilidad; ya no se usa con <img>. */
  priority?: boolean;
}) {
  const widths = { sm: 120, md: 180, lg: 260, xl: 360 } as const;
  const inlineStyle = size
    ? { width: `${widths[size]}px`, height: 'auto' as const }
    : undefined;

  return (
    <div className={cn('flex items-center justify-center', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Sistema PILA — Tu seguridad social a un click"
        style={inlineStyle}
        className={cn(
          'max-w-full',
          animated && 'logo-animated',
          imgClassName,
        )}
      />
    </div>
  );
}
