'use client';

import { useActionState, useRef, useEffect } from 'react';
import { createSucursalAction, type ActionState } from './actions';

export function CreateSucursalForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createSucursalAction,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[180px]">
        <label className="block text-xs font-medium text-slate-600">Código</label>
        <input
          name="codigo"
          required
          placeholder="ALI-001"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
        />
      </div>
      <div className="flex-[2] min-w-[240px]">
        <label className="block text-xs font-medium text-slate-600">Nombre</label>
        <input
          name="nombre"
          required
          placeholder="Aliado ACME S.A."
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Creando…' : 'Crear sucursal'}
      </button>
      {state.error && (
        <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.ok && (
        <p className="w-full rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Sucursal creada
        </p>
      )}
    </form>
  );
}
