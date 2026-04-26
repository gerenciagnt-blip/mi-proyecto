import { Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clasificarUrgencia, diasEntre, URGENCIA_TONE } from '@/lib/cartera/labels';

/**
 * Chip que muestra cuántos días pasaron desde la última gestión de una
 * línea de cartera. Si nunca tuvo gestión, cuenta desde la fecha de
 * importación del consolidado (cuando entró al sistema).
 *
 * El color sale automático de la urgencia:
 *   verde  <7d
 *   amarillo 7-29d
 *   naranja 30-59d
 *   rojo  ≥60d
 *
 * Usado en /admin/soporte/cartera/[id] y /admin/administrativo/cartera.
 */
export function DiasSinGestionChip({
  ultimaGestion,
  fechaCreacion,
}: {
  /** Fecha de la última gestión (la más reciente). Null si nunca tuvo. */
  ultimaGestion: Date | null;
  /** Fallback: fecha de creación del consolidado/línea. */
  fechaCreacion: Date;
}) {
  const referencia = ultimaGestion ?? fechaCreacion;
  const dias = diasEntre(referencia);
  const urgencia = clasificarUrgencia(dias);
  const label = dias === 0 ? 'Hoy' : `${dias}d`;
  const titulo = ultimaGestion
    ? `Última gestión: ${ultimaGestion.toLocaleDateString('es-CO')}`
    : `Sin gestiones — desde importación: ${fechaCreacion.toLocaleDateString('es-CO')}`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        URGENCIA_TONE[urgencia],
      )}
      title={titulo}
    >
      <Clock3 className="h-3 w-3" />
      {label}
    </span>
  );
}
