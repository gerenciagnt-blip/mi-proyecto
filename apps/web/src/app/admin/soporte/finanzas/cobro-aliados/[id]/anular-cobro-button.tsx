'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2 } from 'lucide-react';
import { anularCobroAction } from '../actions';

/**
 * Botón "Anular cobro" — solo aparece para cobros PENDIENTE/VENCIDO. Al
 * anular, el sistema desbloquea automáticamente la sucursal si no le
 * quedan otros cobros vencidos.
 *
 * Pide doble confirmación porque la operación cambia el estado del cobro
 * sin posibilidad de revertir desde la UI (volver a PENDIENTE solo via
 * DB).
 */
export function AnularCobroButton({ cobroId }: { cobroId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (
            !confirm(
              '¿Anular este cobro?\n\n' +
                'El cobro pasará a estado ANULADO y no podrá marcarse como pagado.\n' +
                'Si la sucursal estaba bloqueada por mora y no le quedan otros vencidos, ' +
                'se desbloqueará automáticamente.',
            )
          )
            return;

          setError(null);
          startTransition(async () => {
            const r = await anularCobroAction(cobroId);
            if (r.error) setError(r.error);
            else router.refresh();
          });
        }}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Ban className="h-3.5 w-3.5" />
        )}
        {pending ? 'Anulando…' : 'Anular cobro'}
      </button>
      {error && (
        <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{error}</p>
      )}
    </div>
  );
}
