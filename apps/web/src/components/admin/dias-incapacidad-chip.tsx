import { Clock3, CheckCircle2 } from 'lucide-react';
import type { IncapacidadEstado } from '@pila/db';
import { cn } from '@/lib/utils';
import { URGENCIA_TONE } from '@/lib/cartera/labels';
import { diasIncapacidad } from '@/lib/incapacidades/dias';

/**
 * Chip que muestra cuántos días lleva una incapacidad desde su
 * radicación. A diferencia del de cartera, NO se resetea con cada
 * gestión interna — solo se DETIENE cuando el caso cierra
 * (PAGADA / RECHAZADA).
 *
 * Visual:
 *   - Activa (RADICADA / EN_REVISION / APROBADA):
 *     chip con color por urgencia (verde/amarillo/naranja/rojo).
 *   - Cerrada (PAGADA / RECHAZADA):
 *     chip gris con check + "Xd" — info histórica del proceso.
 *
 * Tooltip con la fecha exacta de radicación y, si aplica, de cierre.
 */
export function DiasIncapacidadChip({
  fechaRadicacion,
  estado,
  fechaCierre,
}: {
  fechaRadicacion: Date;
  estado: IncapacidadEstado;
  /** Fecha en que el caso pasó a PAGADA o RECHAZADA. Null si sigue activo. */
  fechaCierre: Date | null;
}) {
  const info = diasIncapacidad({ fechaRadicacion, estado, fechaCierre });
  const label = info.dias === 0 ? 'Hoy' : `${info.dias}d`;

  const titulo = info.cerrada
    ? `Radicada: ${fechaRadicacion.toLocaleDateString('es-CO')}\nCerrada (${estado}): ${fechaCierre?.toLocaleDateString('es-CO') ?? 'fecha no registrada'}\nDuración total: ${info.dias} días`
    : `Radicada: ${fechaRadicacion.toLocaleDateString('es-CO')}\nDías corridos sin cerrar: ${info.dias}`;

  if (info.cerrada) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
        title={titulo}
      >
        <CheckCircle2 className="h-3 w-3" />
        {label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        URGENCIA_TONE[info.urgencia],
      )}
      title={titulo}
    >
      <Clock3 className="h-3 w-3" />
      {label}
    </span>
  );
}
