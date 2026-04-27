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

  // El campo `codigoAxa` solo tiene sentido para EPS y AFP — son las
  // entidades que el bot Colpatria llena en su form. Para ARL y CCF
  // ocultamos el input (queda null en BD).
  const muestraCodigoAxa = tipo === 'EPS' || tipo === 'AFP';

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
        <Input id="codigoMinSalud" name="codigoMinSalud" placeholder="opcional" className="mt-1" />
      </div>

      <div>
        <Label htmlFor="nit">NIT</Label>
        <Input id="nit" name="nit" placeholder="opcional" className="mt-1" />
      </div>

      {muestraCodigoAxa && (
        <div className="sm:col-span-2">
          <Label htmlFor="codigoAxa">
            Cód. AXA Colpatria{' '}
            <span className="text-[10px] font-normal text-slate-400">(bot Colpatria)</span>
          </Label>
          <Input
            id="codigoAxa"
            name="codigoAxa"
            placeholder='ej. "1" para ALIANSALUD'
            className="mt-1"
          />
        </div>
      )}

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
