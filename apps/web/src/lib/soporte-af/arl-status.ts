/**
 * Sprint Soporte reorg — Mapeo del estado del bot Colpatria al lenguaje
 * de soporte para mostrar en la tabla de Afiliaciones.
 *
 * Estados del bot (`ColpatriaJobStatus`): PENDING, RUNNING, SUCCESS,
 * FAILED, RETRYABLE.
 *
 * Convención visual: la columna "Estado ARL" aparece **solo** si el plan
 * de la afiliación incluye ARL (`PlanSgss.incluyeArl=true`) Y la empresa
 * planilla tiene el bot activo (`Empresa.colpatriaActivo=true`). En
 * cualquier otro caso devolvemos `null` y la celda muestra "—".
 */
import type { ColpatriaJobStatus } from '@pila/db';

export type ArlStatusKind =
  | 'pendiente'
  | 'procesando'
  | 'afiliada'
  | 'fallida'
  | 'reintento'
  | 'sin_job';

export type ArlStatus = {
  kind: ArlStatusKind;
  label: string;
  tone: string; // tailwind classes (ring + bg + text)
};

const TONOS: Record<ArlStatusKind, string> = {
  pendiente: 'bg-slate-50 text-slate-700 ring-slate-200',
  procesando: 'bg-sky-50 text-sky-700 ring-sky-200',
  afiliada: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  fallida: 'bg-red-50 text-red-700 ring-red-200',
  reintento: 'bg-amber-50 text-amber-700 ring-amber-200',
  sin_job: 'bg-slate-50 text-slate-500 ring-slate-200',
};

/**
 * Devuelve el estado ARL "humanizado" para mostrar en la tabla. `null`
 * significa "no aplica" — el caller debe pintar `—` o lo que prefiera.
 *
 * - planIncluyeArl=false → null (el plan no toca ARL, no tiene sentido)
 * - empresaColpatriaActivo=false → null (no es bot-eligible)
 * - planIncluyeArl=true && empresaColpatriaActivo=true && lastJob=null →
 *   `sin_job` (el job aún no se creó — semilla pendiente o feature flag)
 */
export function arlStatusFromBot(opts: {
  planIncluyeArl: boolean;
  empresaColpatriaActivo: boolean;
  lastJobStatus: ColpatriaJobStatus | null;
}): ArlStatus | null {
  if (!opts.planIncluyeArl) return null;
  if (!opts.empresaColpatriaActivo) return null;

  if (opts.lastJobStatus === null) {
    return { kind: 'sin_job', label: 'Sin job', tone: TONOS.sin_job };
  }

  switch (opts.lastJobStatus) {
    case 'PENDING':
      return { kind: 'pendiente', label: 'Pendiente bot', tone: TONOS.pendiente };
    case 'RUNNING':
      return { kind: 'procesando', label: 'Procesando', tone: TONOS.procesando };
    case 'SUCCESS':
      return { kind: 'afiliada', label: 'Afiliada', tone: TONOS.afiliada };
    case 'FAILED':
      return { kind: 'fallida', label: 'Fallida', tone: TONOS.fallida };
    case 'RETRYABLE':
      return { kind: 'reintento', label: 'Reintento', tone: TONOS.reintento };
  }
}
