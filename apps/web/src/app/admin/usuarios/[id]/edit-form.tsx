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
// Mismo razonamiento que en create-form: ASESOR_COMERCIAL no se gestiona
// desde acá, pero `basedOn` se tipa abierto al enum para que la query
// de BD no requiera cast.
type RolCustomOpt = {
  id: string;
  nombre: string;
  basedOn: import('@pila/db').Role;
};

type AsesorComercialInfo = {
  codigo: string;
  nombre: string;
  email: string | null;
  sucursal: { codigo: string; nombre: string } | null;
};

export function EditUserForm({
  user,
  sucursales,
  rolesCustom,
  sessionUserId,
  tarifaOrdinario,
  tarifaResolucion,
  asesorComercial,
}: {
  user: User;
  sucursales: Sucursal[];
  rolesCustom: RolCustomOpt[];
  /** ID del usuario actualmente logueado (para proteger auto-cambio). */
  sessionUserId: string;
  /** Tarifas actuales de la sucursal del aliado (solo ALIADO_OWNER). */
  tarifaOrdinario: number | null;
  tarifaResolucion: number | null;
  /**
   * Sprint Asesor Comercial — info del catálogo si el user es ASESOR_COMERCIAL.
   * Si está presente, se muestra read-only y se bloquea el cambio de rol/sucursal.
   */
  asesorComercial: AsesorComercialInfo | null;
}) {
  const bound = updateUserAction.bind(null, user.id);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const [role, setRole] = useState<Role>(user.role);
  const [rolCustomId, setRolCustomId] = useState<string>(user.rolCustomId ?? '');
  const esSelf = user.id === sessionUserId;
  // Sprint Asesor Comercial — un user vinculado a un asesor del catálogo
  // no puede cambiar de rol ni de sucursal desde acá. Para reasignar
  // hay que borrar el login (en el catálogo) y crear uno nuevo.
  const esAsesor = user.role === 'ASESOR_COMERCIAL';
  const bloqueado = esSelf || esAsesor;
  const esStaff = role === 'ADMIN' || role === 'SOPORTE';
  const rolesCustomDisponibles = rolesCustom.filter((r) => r.basedOn === role);

  return (
    <form action={action} className="space-y-4">
      {esSelf && (
        <Alert variant="info">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Estás editando tu propio usuario — el rol y la sucursal quedan bloqueados para evitar
            perder tu acceso.
          </span>
        </Alert>
      )}
      {esAsesor && asesorComercial && (
        <Alert variant="info">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Este login está vinculado al asesor del catálogo{' '}
            <span className="font-mono font-semibold">{asesorComercial.codigo}</span>
            {' · '}
            {asesorComercial.nombre}
            {asesorComercial.sucursal && (
              <>
                {' '}
                — sucursal <span className="font-mono">{asesorComercial.sucursal.codigo}</span>
              </>
            )}
            . El rol y la sucursal no se editan acá; para reasignar, borra este login desde el
            catálogo y crea uno nuevo.
          </span>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">
            Nombre <span className="text-red-500">*</span>
          </Label>
          <Input id="name" name="name" required defaultValue={user.name} className="mt-1" />
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
            disabled={bloqueado}
            className="mt-1"
          >
            <option value="ADMIN">Administrador</option>
            <option value="SOPORTE">Soporte</option>
            <option value="ALIADO_OWNER">Dueño Aliado</option>
            <option value="ALIADO_USER">Usuario Aliado</option>
            {/* Solo aparece cuando el user YA es asesor — no se "convierte"
               a asesor desde esta pantalla (eso es flujo del create-form). */}
            {esAsesor && <option value="ASESOR_COMERCIAL">Asesor Comercial</option>}
          </Select>
        </div>
        {!esStaff && !esAsesor && (
          <div>
            <Label htmlFor="sucursalId">
              Sucursal <span className="text-red-500">*</span>
            </Label>
            <Select
              id="sucursalId"
              name="sucursalId"
              required
              defaultValue={user.sucursalId ?? ''}
              disabled={bloqueado}
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

      {/* Tarifas de cobro — solo cuando el usuario es ALIADO_OWNER */}
      {role === 'ALIADO_OWNER' && (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
            Tarifas de cobro (por período)
          </legend>
          <p className="mb-3 text-xs text-slate-500">
            Valor que la plataforma cobra a este aliado por cada afiliación / mensualidad procesada,
            según el régimen de la afiliación. Las tarifas se guardan en la sucursal — todos los
            usuarios de esa sucursal comparten las mismas.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tarifaOrdinario">Tarifa régimen ORDINARIO (COP)</Label>
              <Input
                id="tarifaOrdinario"
                name="tarifaOrdinario"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                defaultValue={tarifaOrdinario ?? ''}
                placeholder="Ej. 25000"
                disabled={esSelf}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="tarifaResolucion">Tarifa régimen RESOLUCIÓN (COP)</Label>
              <Input
                id="tarifaResolucion"
                name="tarifaResolucion"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                defaultValue={tarifaResolucion ?? ''}
                placeholder="Ej. 18000"
                disabled={esSelf}
                className="mt-1 font-mono"
              />
            </div>
          </div>
        </fieldset>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={user.active}
          disabled={bloqueado}
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
