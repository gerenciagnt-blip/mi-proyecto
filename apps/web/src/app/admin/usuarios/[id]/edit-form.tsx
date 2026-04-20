'use client';

import { useActionState, useState } from 'react';
import { updateUserAction, type ActionState } from '../actions';
import type { Role } from '@pila/db';

type User = {
  id: string;
  name: string;
  role: Role;
  sucursalId: string | null;
  active: boolean;
};

type Sucursal = { id: string; codigo: string; nombre: string };

export function EditUserForm({
  user,
  sucursales,
}: {
  user: User;
  sucursales: Sucursal[];
}) {
  const bound = updateUserAction.bind(null, user.id);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const [role, setRole] = useState<Role>(user.role);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600">Nombre</label>
        <input
          name="name"
          required
          defaultValue={user.name}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Rol</label>
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="ADMIN">Administrador</option>
          <option value="ALIADO_OWNER">Dueño Aliado</option>
          <option value="ALIADO_USER">Usuario Aliado</option>
        </select>
      </div>
      {role !== 'ADMIN' && (
        <div>
          <label className="block text-xs font-medium text-slate-600">Sucursal</label>
          <select
            name="sucursalId"
            required
            defaultValue={user.sucursalId ?? ''}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— Seleccionar —</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.codigo} — {s.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={user.active} />
        <span>Activo</span>
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
