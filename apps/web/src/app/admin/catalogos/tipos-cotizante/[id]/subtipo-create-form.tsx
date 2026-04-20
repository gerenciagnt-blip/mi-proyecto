'use client';

import { useActionState, useRef, useEffect } from 'react';
import { createSubtipoAction, type ActionState } from './actions';

export function CreateSubtipoForm({ tipoCotizanteId }: { tipoCotizanteId: string }) {
  const bound = createSubtipoAction.bind(null, tipoCotizanteId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[100px]">
        <label className="block text-xs font-medium text-slate-600">Código</label>
        <input
          name="codigo"
          required
          placeholder="00"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex-1 min-w-[240px]">
        <label className="block text-xs font-medium text-slate-600">Nombre</label>
        <input
          name="nombre"
          required
          placeholder="Planta permanente"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Creando…' : 'Crear subtipo'}
      </button>
      {state.error && (
        <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
