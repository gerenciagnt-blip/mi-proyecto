'use client';

import { useActionState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createCargoAction, type ActionState } from './actions';

type Actividad = { id: string; codigoCiiu: string; descripcion: string };

export function CreateCargoForm({ actividades }: { actividades: Actividad[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCargoAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div>
        <Label htmlFor="codigo">Código</Label>
        <Input id="codigo" name="codigo" required placeholder="SUP-001" className="mt-1 uppercase" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="nombre">Nombre del cargo</Label>
        <Input id="nombre" name="nombre" required placeholder="Supervisor operativo" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="actividadEconomicaId">Actividad (CIIU)</Label>
        <select
          id="actividadEconomicaId"
          name="actividadEconomicaId"
          defaultValue=""
          className="mt-1 h-12 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-base text-brand-text-primary sm:text-sm"
        >
          <option value="">—</option>
          {actividades.map((a) => (
            <option key={a.id} value={a.id}>
              {a.codigoCiiu} — {a.descripcion}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-4 sm:flex sm:justify-end">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Creando…' : 'Crear cargo'}
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
