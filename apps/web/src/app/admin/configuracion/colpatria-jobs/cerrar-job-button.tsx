'use client';

import { useState, useTransition } from 'react';
import { XCircle } from 'lucide-react';
import { cerrarJobAction } from './actions';

/**
 * Botón "Cerrar job" — alternativa a Reintentar cuando un job RETRYABLE/FAILED
 * ya no aplica reintento (afiliación cancelada, datos cambiaron, etc.).
 *
 * Pide motivo obligatorio y marca el job como FAILED definitivo. Se registra
 * en bitácora de auditoría con el motivo.
 */
export function CerrarJobButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const motivo = prompt(
            'Motivo del cierre (obligatorio):\n\n' +
              'Ej: "Afiliación cancelada por el aliado", "Datos del cotizante cambiaron, ya no aplica", etc.',
          );
          if (motivo == null) return; // cancelado
          if (!motivo.trim()) {
            alert('El motivo es obligatorio');
            return;
          }
          if (
            !confirm(
              '¿Cerrar este job como FAILED?\n\nEsta acción es definitiva — el job no podrá reintentarse.',
            )
          )
            return;

          setError(null);
          startTransition(async () => {
            const r = await cerrarJobAction(jobId, motivo.trim());
            if (r.error) setError(r.error);
          });
        }}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <XCircle className="h-3 w-3" />
        {pending ? 'Cerrando…' : 'Cerrar job'}
      </button>
      {error && (
        <span className="ml-2 inline-block rounded-md bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">
          {error}
        </span>
      )}
    </>
  );
}
