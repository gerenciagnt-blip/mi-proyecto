'use client';

import { useActionState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createAsesorAction, type ActionState } from './actions';

export function CreateAsesorForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createAsesorAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div>
        <Label htmlFor="codigo">Código</Label>
        <Input id="codigo" name="codigo" required placeholder="AS-001" className="mt-1 uppercase" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="nombre">Nombre completo</Label>
        <Input id="nombre" name="nombre" required placeholder="Laura Gómez" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="telefono">Teléfono</Label>
        <Input id="telefono" name="telefono" placeholder="opcional" className="mt-1" />
      </div>
      <div className="sm:col-span-4">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="asesor@empresa.co (opcional)"
          className="mt-1"
        />
      </div>
      <div className="sm:col-span-4 sm:flex sm:justify-end">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Creando…' : 'Crear asesor'}
        </Button>
      </div>
      {state.error && (
        <div className="sm:col-span-4">
          <Alert variant="danger">{state.error}</Alert>
        </div>
      )}
    </form>
  );
}
