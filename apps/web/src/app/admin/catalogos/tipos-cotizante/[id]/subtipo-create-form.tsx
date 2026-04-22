'use client';

import { useActionState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createSubtipoAction, type ActionState } from './actions';

export function CreateSubtipoForm({ tipoCotizanteId }: { tipoCotizanteId: string }) {
  const bound = createSubtipoAction.bind(null, tipoCotizanteId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[100px]">
        <Label htmlFor="subtipo-codigo">Código</Label>
        <Input id="subtipo-codigo" name="codigo" required placeholder="00" className="mt-1" />
      </div>
      <div className="min-w-[240px] flex-1">
        <Label htmlFor="subtipo-nombre">Nombre</Label>
        <Input
          id="subtipo-nombre"
          name="nombre"
          required
          placeholder="Planta permanente"
          className="mt-1"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Creando…' : 'Crear subtipo'}
      </Button>
      {state.error && (
        <Alert variant="danger" className="w-full">
          {state.error}
        </Alert>
      )}
    </form>
  );
}
