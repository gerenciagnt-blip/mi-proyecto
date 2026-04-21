'use client';

import { useActionState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createRolCustomAction, type ActionState } from './actions';

const selectClass =
  'mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm text-brand-text-primary';

export function CreateRolCustomForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createRolCustomAction,
    {},
  );

  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div className="sm:col-span-1">
        <Label htmlFor="nombre">Nombre del rol</Label>
        <Input id="nombre" name="nombre" required placeholder="Supervisor" className="mt-1" />
      </div>

      <div className="sm:col-span-2">
        <Label htmlFor="descripcion">Descripción (opcional)</Label>
        <Input
          id="descripcion"
          name="descripcion"
          placeholder="Qué hace este rol"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="basedOn">Basado en</Label>
        <select id="basedOn" name="basedOn" required defaultValue="ALIADO_USER" className={selectClass}>
          <option value="ALIADO_OWNER">Dueño Aliado</option>
          <option value="ALIADO_USER">Usuario Aliado</option>
        </select>
      </div>

      <div className="sm:col-span-4 sm:flex sm:justify-end">
        <Button type="submit" disabled={pending}>
          <Plus className="h-4 w-4" />
          {pending ? 'Creando…' : 'Crear rol'}
        </Button>
      </div>

      {state?.error && (
        <div className="sm:col-span-4">
          <Alert variant="danger">{state.error}</Alert>
        </div>
      )}
    </form>
  );
}
