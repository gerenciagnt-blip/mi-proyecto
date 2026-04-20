'use client';

import { useActionState, useRef, useEffect } from 'react';
import { createEmpresaAction, type ActionState } from './actions';
import { EmpresaFields } from './empresa-fields';

type Arl = { id: string; codigo: string; nombre: string };

export function CreateEmpresaForm({ arls }: { arls: Arl[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createEmpresaAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="space-y-4">
      <EmpresaFields arls={arls} />

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Empresa creada
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Creando…' : 'Crear empresa'}
      </button>
    </form>
  );
}
