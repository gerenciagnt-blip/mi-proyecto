'use client';

import { useActionState, useRef, useEffect } from 'react';
import { createActividadAction, type ActionState } from './actions';

export function CreateActividadForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createActividadAction,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[100px]">
        <label className="block text-xs font-medium text-slate-600">CIIU</label>
        <input
          name="codigoCiiu"
          required
          maxLength={4}
          pattern="[0-9]{4}"
          placeholder="6202"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex-1 min-w-[240px]">
        <label className="block text-xs font-medium text-slate-600">Descripción</label>
        <input
          name="descripcion"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Creando…' : 'Crear'}
      </button>
      {state.error && (
        <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
