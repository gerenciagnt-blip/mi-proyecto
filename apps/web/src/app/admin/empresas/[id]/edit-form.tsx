'use client';

import { useActionState } from 'react';
import { updateEmpresaAction, type ActionState } from '../actions';

type Empresa = { id: string; nit: string; nombre: string; active: boolean };

export function EditEmpresaForm({ empresa }: { empresa: Empresa }) {
  const boundAction = updateEmpresaAction.bind(null, empresa.id);
  const [state, action, pending] = useActionState<ActionState, FormData>(boundAction, {});

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600">NIT</label>
        <input
          name="nit"
          required
          defaultValue={empresa.nit}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Nombre</label>
        <input
          name="nombre"
          required
          defaultValue={empresa.nombre}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={empresa.active} />
        <span>Activa</span>
      </label>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </form>
  );
}
