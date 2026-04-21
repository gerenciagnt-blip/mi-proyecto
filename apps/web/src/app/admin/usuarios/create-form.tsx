'use client';

import { useActionState, useRef, useState, useEffect } from 'react';
import { createUserAction, type ActionState } from './actions';

type Sucursal = { id: string; codigo: string; nombre: string };

export function CreateUserForm({
  sucursales,
  onSuccess,
}: {
  sucursales: Sucursal[];
  onSuccess?: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUserAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState('ALIADO_USER');

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setRole('ALIADO_USER');
      onSuccess?.();
    }
  }, [state.ok, onSuccess]);

  return (
    <form ref={ref} action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="block text-xs font-medium text-slate-600">Correo *</label>
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Nombre *</label>
        <input
          name="name"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Contraseña inicial *</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Rol *</label>
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="ADMIN">Administrador</option>
          <option value="ALIADO_OWNER">Dueño Aliado</option>
          <option value="ALIADO_USER">Usuario Aliado</option>
        </select>
      </div>
      {role !== 'ADMIN' && (
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Sucursal</label>
          <select
            name="sucursalId"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— Seleccionar —</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.codigo} — {s.nombre}
              </option>
            ))}
          </select>
          {sucursales.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Aún no hay sucursales — crea una antes de registrar usuarios de aliado.
            </p>
          )}
        </div>
      )}

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 sm:col-span-2">
          Usuario creado
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Creando…' : 'Crear usuario'}
        </button>
      </div>
    </form>
  );
}
