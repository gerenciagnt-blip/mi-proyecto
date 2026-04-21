'use client';

import { useActionState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createEntidadAction, type ActionState } from './actions';

export function CreateEntidadForm({ tipo }: { tipo: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createEntidadAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <input type="hidden" name="tipo" value={tipo} />

      <div className="sm:col-span-2">
        <Label htmlFor="nombre">Nombre *</Label>
        <Input id="nombre" name="nombre" required placeholder="Nueva EPS S.A.S." className="mt-1" />
      </div>

      <div>
        <Label htmlFor="codigoMinSalud">Cód. MinSalud</Label>
        <Input
          id="codigoMinSalud"
          name="codigoMinSalud"
          placeholder="opcional"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="nit">NIT</Label>
        <Input id="nit" name="nit" placeholder="opcional" className="mt-1" />
      </div>

      <div className="sm:col-span-4 sm:flex sm:items-end sm:justify-between sm:gap-3">
        <p className="text-[11px] text-slate-500">
          El código interno se genera automáticamente ({tipo}-0001, {tipo}-0002…).
        </p>
        <Button type="submit" size="md" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Creando…' : `Crear ${tipo}`}
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
