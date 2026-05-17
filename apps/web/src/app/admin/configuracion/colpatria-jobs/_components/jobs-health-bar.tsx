/**
 * Banner con la salud de la cola de jobs Colpatria.
 *
 * Se renderiza arriba de `JobsSection` y muestra:
 *   - Contadores en vivo: PENDING / RUNNING / RETRYABLE.
 *   - Alerta en rojo si hay jobs colgados (PENDING > 30 min o
 *     RUNNING > 15 min) — son síntoma de que el cron de procesar.yml
 *     no está corriendo o un job quedó stuck.
 *
 * Server Component — recibe el snapshot calculado por la page padre.
 */

import Link from 'next/link';
import { AlertTriangle, Clock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  PENDING_STALE_MINUTES,
  RUNNING_STALE_MINUTES,
  type SaludJobsColpatria,
} from '@/lib/colpatria/salud-jobs';
import { cn } from '@/lib/utils';

export function JobsHealthBar({ salud }: { salud: SaludJobsColpatria }) {
  const hayColgados = salud.pendingStale + salud.runningStale > 0;
  const totalActivos = salud.pendingTotal + salud.runningTotal + salud.retryableTotal;

  return (
    <section
      className={cn(
        'rounded-xl border p-4 text-sm shadow-sm',
        hayColgados ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {hayColgados ? (
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          ) : totalActivos === 0 ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <Clock className="h-5 w-5 text-slate-500" />
          )}
          <h2 className="font-heading text-base font-semibold text-slate-900">
            {hayColgados
              ? `${salud.pendingStale + salud.runningStale} job(s) colgados`
              : totalActivos === 0
                ? 'Cola limpia'
                : 'Cola en curso'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatChip
            label="PENDING"
            value={salud.pendingTotal}
            stale={salud.pendingStale}
            tone="slate"
            Icon={Clock}
          />
          <StatChip
            label="RUNNING"
            value={salud.runningTotal}
            stale={salud.runningStale}
            tone="blue"
            Icon={Loader2}
          />
          <StatChip
            label="RETRYABLE"
            value={salud.retryableTotal}
            stale={0}
            tone="amber"
            Icon={AlertCircle}
          />
        </div>
      </div>

      {hayColgados && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs text-rose-800">
            Umbrales: PENDING &gt; {PENDING_STALE_MINUTES} min · RUNNING &gt;{' '}
            {RUNNING_STALE_MINUTES} min. Revisa que el workflow{' '}
            <code className="rounded bg-rose-100 px-1 font-mono">bot-colpatria-procesar.yml</code>{' '}
            esté corriendo en horario laboral (lun-vie 8-18h COL).
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-white p-2 ring-1 ring-inset ring-rose-200">
            {salud.stale.slice(0, 10).map((j) => (
              <li
                key={j.id}
                className="flex items-center justify-between gap-2 text-[11px] text-slate-700"
              >
                <Link
                  href={`/admin/configuracion/colpatria-jobs/${j.id}`}
                  className="font-mono text-rose-700 hover:underline"
                >
                  {j.id.slice(-8)}
                </Link>
                <span className="font-mono text-slate-500">{j.status}</span>
                <span className="ml-auto text-rose-700">{j.minutosColgado} min</span>
              </li>
            ))}
            {salud.stale.length > 10 && (
              <li className="pt-1 text-center text-[10px] text-slate-500">
                + {salud.stale.length - 10} más
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

function StatChip({
  label,
  value,
  stale,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  stale: number;
  tone: 'slate' | 'blue' | 'amber';
  Icon: typeof Clock;
}) {
  const toneCls =
    tone === 'blue'
      ? 'bg-blue-50 text-blue-700 ring-blue-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-slate-50 text-slate-700 ring-slate-200';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 ring-1 ring-inset',
        toneCls,
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="font-medium">{label}</span>
      <span className="font-mono font-bold">{value}</span>
      {stale > 0 && (
        <span className="ml-1 rounded bg-rose-600 px-1 font-mono text-[10px] font-bold text-white">
          {stale} colgado{stale === 1 ? '' : 's'}
        </span>
      )}
    </span>
  );
}
