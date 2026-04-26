'use client';

import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { reintentarJobAction } from './actions';

/**
 * Botón "Reintentar" — encapsula la transición de pending para deshabilitar
 * mientras la action corre y refrescar la lista al volver.
 */
export function ReintentarButton({ jobId, disabled }: { jobId: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();

  if (disabled) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (!confirm('¿Reintentar este job? Crea uno nuevo con el mismo payload.')) return;
        startTransition(async () => {
          const r = await reintentarJobAction(jobId);
          if (r.error) alert(r.error);
        });
      }}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
    >
      <RefreshCw className={`h-3 w-3 ${pending ? 'animate-spin' : ''}`} />
      {pending ? 'Reintentando…' : 'Reintentar'}
    </button>
  );
}
