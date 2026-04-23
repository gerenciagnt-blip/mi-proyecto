'use client';

import { useState, useTransition } from 'react';
import { toggleUserAction } from './actions';

/**
 * Botón que activa/desactiva un usuario. Cuando la acción es DESACTIVAR,
 * se pide confirmación explícita para evitar desactivaciones accidentales.
 * ACTIVAR es reversible y no requiere confirm.
 */
export function ToggleUserButton({
  userId,
  activo,
  nombre,
}: {
  userId: string;
  activo: boolean;
  nombre: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (activo) {
            const ok = confirm(
              `¿Desactivar el usuario "${nombre}"?\n\nNo podrá iniciar sesión hasta que lo vuelvas a activar.`,
            );
            if (!ok) return;
          }
          setErr(null);
          start(async () => {
            try {
              await toggleUserAction(userId);
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Error');
            }
          });
        }}
        className="text-xs font-medium text-slate-500 transition hover:text-slate-900 disabled:opacity-60"
      >
        {pending ? '…' : activo ? 'Desactivar' : 'Activar'}
      </button>
      {err && <span className="ml-2 text-xs text-red-700">{err}</span>}
    </>
  );
}
