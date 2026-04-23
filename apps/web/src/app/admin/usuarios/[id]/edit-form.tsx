'use client';

import { useActionState, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import type { Role } from '@pila/db';
import { updateUserAction, type ActionState } from '../actions';

type User = {
  id: string;
  name: string;
  role: Role;
  sucursalId: string | null;
  rolCustomId: string | null;
  active: boolean;
};

type Sucursal = { id: string; codigo: string; nombre: string };
type RolCustomOpt = {
  id: string;
  nombre: string;
  basedOn: 'ADMIN' | 'SOPORTE' | 'ALIADO_OWNER' | 'ALIADO_USER';
};

export function EditUserForm({
  user,
  sucursales,
  rolesCustom,
  sessionUserId,
}: {
  user: User;
  sucursales: Sucursal[];
  rolesCustom: RolCustomOpt[];
  /** ID del usuario actualmente logueado (para proteger auto-cambio). */
  sessionUserId: string;
}) {
  const bound = updateUserAction.bind(null, user.id);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const [role, setRole] = useState<Role>(user.role);
  const [rolCustomId, setRolCustomId] = useState<string>(user.rolCustomId ?? '');
  const esSelf = user.id === sessionUserId;
  const esStaff = role === 'ADMIN' || role === 'SOPORTE';
  const rolesCustomDisponibles = rolesCustom.filter((r) => r.basedOn === role);

  return (
    <form action={action} className="space-y-4">
      {esSelf && (
        <Alert variant="info">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Estás editando tu propio usuario — el rol y la sucursal quedan
            bloqueados para evitar perder tu acceso.
          </span>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">
            Nombre <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={user.name}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="role">
            Nivel base <span className="text-red-500">*</span>
          </Label>
          <Select
            id="role"
            name="role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role);
              setRolCustomId(''); // reset al cambiar nivel
            }}
            disabled={esSelf}
            className="mt-1"
          >
            <option value="ADMIN">Administrador</option>
            <option value="SOPORTE">Soporte</option>
            <option value="ALIADO_OWNER">Dueño Aliado</option>
            {user.role === 'ALIADO_USER' && (
              <option value="ALIADO_USER">Usuario Aliado (legado)</option>
            )}
          </Select>
        </div>
        {!esStaff && (
          <div>
            <Label htmlFor="sucursalId">
              Sucursal <span className="text-red-500">*</span>
            </Label>
            <Select
              id="sucursalId"
              name="sucursalId"
              required
              defaultValue={user.sucursalId ?? ''}
              disabled={esSelf}
              className="mt-1"
            >
              <option value="" disabled>
                — Seleccionar —
              </option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} — {s.nombre}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="sm:col-span-2">
          <Label htmlFor="rolCustomId">Rol personalizado (opcional)</Label>
          <Select
            id="rolCustomId"
            name="rolCustomId"
            value={rolCustomId}
            onChange={(e) => setRolCustomId(e.target.value)}
            disabled={esSelf}
            className="mt-1"
          >
            <option value="">— Usar permisos base del nivel —</option>
            {rolesCustomDisponibles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={user.active}
          disabled={esSelf}
          className="h-4 w-4 rounded border-slate-300"
        />
        <span>Usuario activo</span>
      </label>

      {state.error && (
        <Alert variant="danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
