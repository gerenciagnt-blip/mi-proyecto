'use client';

import { useActionState } from 'react';
import { Check, Loader2, Info } from 'lucide-react';
import { marcarCobroPagadoAction, type ActionState } from '../actions';

export function MarcarPagadoForm({
  cobroId,
  mediosPago,
  totalCobro,
}: {
  cobroId: string;
  mediosPago: Array<{ id: string; nombre: string }>;
  /** Total del cobro. Si es 0 → cobro de "período sin movimientos": el form
   *  oculta los campos de medio/referencia y muestra mensaje informativo. */
  totalCobro: number;
}) {
  const accion = marcarCobroPagadoAction.bind(null, cobroId);
  const [state, submit, pending] = useActionState<ActionState, FormData>(accion, {});
  const esCobroVacio = totalCobro === 0;

  return (
    <form action={submit} className="space-y-3">
      {esCobroVacio ? (
        <div className="flex items-start gap-2 rounded-md bg-sky-50 px-3 py-2.5 text-xs text-sky-800 ring-1 ring-inset ring-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Período sin movimientos</p>
            <p className="mt-0.5">
              Este cobro es de <strong>$0</strong> porque la sucursal no tuvo afiliaciones ni
              mensualidades cobrables en el período. Solo confírmalo para cerrarlo — no se requiere
              medio de pago ni referencia.
            </p>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}

      <div>
        <label
          htmlFor="observaciones"
          className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
        >
          Observaciones {esCobroVacio && <span className="text-slate-400">(opcional)</span>}
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
        {esCobroVacio ? 'Cerrar período' : 'Marcar como pagado'}
      </button>
    </form>
  );
}
