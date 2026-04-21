import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Logo oficial Sistema PILA (PNG en /public/logo.png).
 * El PNG ya incluye símbolo + "SISTEMA PILA" + slogan.
 */
export function PilaLogo({
  size = 'md',
  className,
  priority = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  priority?: boolean;
}) {
  const widths = { sm: 120, md: 180, lg: 260 } as const;
  const w = widths[size];

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <Image
        src="/logo.png"
        alt="Sistema PILA — Tu seguridad social a un click"
        width={w}
        height={Math.round(w * 0.77)}
        priority={priority}
        className="h-auto w-auto"
        style={{ maxWidth: `${w}px` }}
      />
    </div>
  );
}
