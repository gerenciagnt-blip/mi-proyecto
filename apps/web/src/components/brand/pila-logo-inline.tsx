import fs from 'node:fs';
import path from 'node:path';
import { cn } from '@/lib/utils';

/**
 * Server component que inyecta el /public/logo.svg en línea para que el CSS
 * externo pueda estilar sus paths — necesario para la animación "circuito
 * recorriendo la S".
 *
 * - Cache por proceso (se lee una vez y se reutiliza).
 * - Contenido confiable (asset propio), por eso dangerouslySetInnerHTML es
 *   seguro aquí.
 * - El tamaño se controla vía `imgClassName` en el wrapper (ej.
 *   "w-56 md:w-72 lg:w-[340px]"); el <svg> interno se ajusta al 100% del
 *   contenedor manteniendo la relación de aspecto.
 */

let svgCache: string | null = null;

function loadLogo(): string {
  if (svgCache !== null) return svgCache;
  try {
    const p = path.join(process.cwd(), 'public', 'logo.svg');
    const raw = fs.readFileSync(p, 'utf8');
    // Quitar declaración XML (solo válida como primera línea de un .svg)
    // y forzar el <svg> a llenar el contenedor manteniendo aspect-ratio.
    svgCache = raw
      .replace(/<\?xml[^?]*\?>\s*/i, '')
      .replace(
        /<svg\b([^>]*)>/,
        '<svg$1 style="display:block;width:100%;height:auto">',
      )
      .trim();
    return svgCache;
  } catch (e) {
    console.error('[PilaLogoInline] no se pudo leer logo.svg:', e);
    svgCache = '';
    return '';
  }
}

export function PilaLogoInline({
  className,
  imgClassName,
  animated = false,
}: {
  className?: string;
  /** Clases Tailwind para el wrapper — controlan el ancho responsive. */
  imgClassName?: string;
  /** Si true, aplica la animación .logo-animated definida en globals.css. */
  animated?: boolean;
}) {
  const svg = loadLogo();

  return (
    <div
      role="img"
      aria-label="Sistema PILA — Tu seguridad social a un click"
      className={cn(
        'flex items-center justify-center',
        animated && 'logo-animated',
        imgClassName,
        className,
      )}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
