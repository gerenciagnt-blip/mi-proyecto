'use client';

import { useActionState } from 'react';
import { updateSucursalAction, type ActionState } from '../actions';

type Sucursal = { id: string; codigo: string; nombre: string; active: boolean };

export function EditSucursalForm({ sucursal }: { sucursal: Sucursal }) {
  const boundAction = updateSucursalAction.bind(null, sucursal.id);
  const [state, action, pending] = useActionState<ActionState, FormData>(boundAction, {});

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600">Código</label>
        <input
          name="codigo"
          required
          defaultValue={sucursal.codigo}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Nombre</label>
        <input
          name="nombre"
          required
          defaultValue={sucursal.nombre}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={sucursal.active} />
        <span>Activa</span>
      </label>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
