'use client';

import { useActionState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createServicioAction, type ActionState } from './actions';

export function CreateServicioForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createServicioAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div>
        <Label htmlFor="codigo">Código</Label>
        <Input id="codigo" name="codigo" required placeholder="SRV-001" className="mt-1 uppercase" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" required placeholder="Certificado de afiliación" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="precio">Precio (COP)</Label>
        <Input
          id="precio"
          name="precio"
          type="number"
          step="1"
          min="0"
          defaultValue="0"
          className="mt-1"
        />
      </div>
      <div className="sm:col-span-4">
        <Label htmlFor="descripcion">Descripción (opcional)</Label>
        <Input id="descripcion" name="descripcion" className="mt-1" />
      </div>
      <div className="sm:col-span-4 sm:flex sm:justify-end">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Creando…' : 'Crear servicio'}
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
