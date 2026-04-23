'use client';

import { useActionState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createMedioPagoAction, type ActionState } from './actions';

type Sucursal = { id: string; codigo: string; nombre: string };

export function CreateMedioPagoForm({
  esStaff,
  sucursales,
}: {
  esStaff: boolean;
  sucursales: Sucursal[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createMedioPagoAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
      <div>
        <Label htmlFor="codigo">Código</Label>
        <Input id="codigo" name="codigo" required placeholder="EFEC" className="mt-1 uppercase" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input
          id="nombre"
          name="nombre"
          required
          placeholder="Efectivo, transferencia, PSE, etc."
          className="mt-1"
        />
      </div>
      {esStaff && (
        <div>
          <Label htmlFor="sucursalId">Sucursal</Label>
          <Select
            id="sucursalId"
            name="sucursalId"
            defaultValue="GLOBAL"
            className="mt-1"
          >
            <option value="GLOBAL">Global (todas)</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.codigo} — {s.nombre}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="sm:flex sm:items-end">
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Creando…' : 'Crear'}
        </Button>
      </div>
      {state.error && (
        <div className="sm:col-span-5">
          <Alert variant="danger">{state.error}</Alert>
        </div>
      )}
    </form>
  );
}
