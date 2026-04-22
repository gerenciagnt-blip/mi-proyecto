'use client';

import { useActionState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createActividadAction, type ActionState } from './actions';

export function CreateActividadForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createActividadAction,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[100px]">
        <Label htmlFor="codigoCiiu">CIIU</Label>
        <Input
          id="codigoCiiu"
          name="codigoCiiu"
          required
          maxLength={4}
          pattern="[0-9]{4}"
          placeholder="6202"
          className="mt-1"
        />
      </div>
      <div className="min-w-[240px] flex-1">
        <Label htmlFor="descripcion">Descripción</Label>
        <Input
          id="descripcion"
          name="descripcion"
          required
          className="mt-1"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Creando…' : 'Crear'}
      </Button>
      {state.error && (
        <Alert variant="danger" className="w-full">
          {state.error}
        </Alert>
      )}
    </form>
  );
}
