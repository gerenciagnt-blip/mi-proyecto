'use client';

import { useActionState, useRef, useEffect } from 'react';
import { resetPasswordAction, type ActionState } from '../actions';

export function PasswordForm({ userId }: { userId: string }) {
  const bound = resetPasswordAction.bind(null, userId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600">Nueva contraseña</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Contraseña actualizada
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-60"
      >
        {pending ? 'Actualizando…' : 'Restablecer contraseña'}
      </button>
    </form>
  );
}
