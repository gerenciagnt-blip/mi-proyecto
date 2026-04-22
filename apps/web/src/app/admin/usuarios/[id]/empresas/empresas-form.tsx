'use client';

import { useActionState, useState } from 'react';
import { updateUserEmpresasAction, type ActionState } from './actions';

type Empresa = { id: string; nit: string; nombre: string };

export function EmpresasAccessForm({
  userId,
  empresas,
  granted,
}: {
  userId: string;
  empresas: Empresa[];
  granted: string[];
}) {
  const bound = updateUserEmpresasAction.bind(null, userId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const [filter, setFilter] = useState('');
  const initial = new Set(granted);

  const visible = empresas.filter((e) => {
    const q = filter.toLowerCase();
    return !q || e.nit.toLowerCase().includes(q) || e.nombre.toLowerCase().includes(q);
  });

  return (
    <form action={action} className="space-y-4">
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Buscar por NIT o nombre..."
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200">
        {visible.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Sin resultados</p>
        )}
        <ul className="divide-y divide-slate-100">
          {visible.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
              <input
                type="checkbox"
                name="empresaId"
                value={e.id}
                defaultChecked={initial.has(e.id)}
                id={`emp-${e.id}`}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor={`emp-${e.id}`} className="flex-1 cursor-pointer text-sm">
                <span className="font-mono text-xs text-slate-500">{e.nit}</span>
                <span className="ml-3">{e.nombre}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Accesos actualizados
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </form>
  );
}
