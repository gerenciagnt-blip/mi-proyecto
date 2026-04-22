'use client';

import { useActionState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createTipoAction, type ActionState } from './actions';

export function CreateTipoForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTipoAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[100px]">
        <Label htmlFor="codigo">Código *</Label>
        <Input id="codigo" name="codigo" required placeholder="01" className="mt-1" />
      </div>
      <div className="min-w-[240px] flex-1">
        <Label htmlFor="nombre">Nombre *</Label>
        <Input id="nombre" name="nombre" required placeholder="Dependiente" className="mt-1" />
      </div>
      <div className="min-w-[160px]">
        <Label htmlFor="modalidad">Modalidad *</Label>
        <Select
          id="modalidad"
          name="modalidad"
          required
          defaultValue="DEPENDIENTE"
          className="mt-1"
        >
          <option value="DEPENDIENTE">Dependiente</option>
          <option value="INDEPENDIENTE">Independiente</option>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Creando…' : 'Crear tipo'}
      </Button>
      {state.error && (
        <Alert variant="danger" className="w-full">
          {state.error}
        </Alert>
      )}
    </form>
  );
}
