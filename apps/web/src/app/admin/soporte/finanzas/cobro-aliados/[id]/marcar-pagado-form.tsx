'use client';

import { useActionState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { marcarCobroPagadoAction, type ActionState } from '../actions';

export function MarcarPagadoForm({
  cobroId,
  mediosPago,
}: {
  cobroId: string;
  mediosPago: Array<{ id: string; nombre: string }>;
}) {
  const accion = marcarCobroPagadoAction.bind(null, cobroId);
  const [state, submit, pending] = useActionState<ActionState, FormData>(accion, {});

  return (
    <form action={submit} className="space-y-3">
      <div>
        <label
          htmlFor="medioPagoId"
          className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
        >
          Medio de pago
        </label>
        <select
          id="medioPagoId"
          name="medioPagoId"
          className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
        >
          <option value="">— No especificado —</option>
          {mediosPago.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          htmlFor="referenciaPago"
          className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
        >
          Referencia (opcional)
        </label>
        <input
          id="referenciaPago"
          name="referenciaPago"
          placeholder="No. transferencia, consignación…"
          className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
      </div>
      <div>
        <label
          htmlFor="observaciones"
          className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
        >
          Observaciones
        </label>
        <textarea
          id="observaciones"
          name="observaciones"
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</p>
      )}
      {state.ok && (
        <p className="flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <Check className="h-3 w-3" /> Marcado como pagado
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Marcar como pagado
      </button>
    </form>
  );
}
