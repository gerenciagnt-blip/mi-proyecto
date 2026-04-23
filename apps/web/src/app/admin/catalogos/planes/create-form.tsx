'use client';

import { useActionState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createPlanAction, type ActionState } from './actions';

export function CreatePlanForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createPlanAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="sm:col-span-4">
          <Label htmlFor="nombre">Nombre *</Label>
          <Input
            id="nombre"
            name="nombre"
            required
            placeholder="Integral Dependiente"
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-4">
          <Label htmlFor="descripcion">Descripción (opcional)</Label>
          <Input id="descripcion" name="descripcion" className="mt-1" />
        </div>
      </div>

      <div>
        <Label>Entidades SGSS que incluye</Label>
        <div className="mt-1 flex flex-wrap gap-3">
          {(['Eps', 'Afp', 'Arl', 'Ccf'] as const).map((e) => (
            <label
              key={e}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <input type="checkbox" name={`incluye${e}`} className="h-4 w-4 rounded" />
              <span>{e.toUpperCase()}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="sm:max-w-xs">
        <Label htmlFor="regimen">Régimen aplicable *</Label>
        <Select id="regimen" name="regimen" defaultValue="AMBOS" required className="mt-1">
          <option value="AMBOS">Ambos regímenes</option>
          <option value="ORDINARIO">Solo ordinario</option>
          <option value="RESOLUCION">Solo resolución</option>
        </Select>
        <p className="mt-1 text-[11px] text-slate-500">
          Determina qué cotizantes pueden usar este plan en su afiliación.
        </p>
      </div>

      <p className="text-[11px] text-slate-500">
        El código interno se genera automáticamente (PLAN-0001, PLAN-0002…).
      </p>

      {state.error && <Alert variant="danger">{state.error}</Alert>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Creando…' : 'Crear plan'}
      </Button>
    </form>
  );
}
