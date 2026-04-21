'use client';

import { useState, useActionState, useEffect } from 'react';
import { Plus, Pencil, Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createFspAction, updateFspAction, type ActionState } from './actions';

export type FspInitial = {
  id: string;
  smlvDesde: number;
  smlvHasta: number | null;
  porcentaje: number;
};

export function CreateFspButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span>Nuevo rango FSP</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo rango FSP"
        description="Porcentaje adicional sobre AFP según rango de SMLV."
        size="sm"
      >
        <FspForm mode="create" onSuccess={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function EditFspButton({ rango }: { rango: FspInitial }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title="Editar"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-brand-blue transition hover:bg-brand-blue/10 hover:text-brand-blue-dark"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Editar rango FSP"
        size="sm"
      >
        <FspForm mode="edit" initial={rango} onSuccess={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function FspForm({
  mode,
  initial,
  onSuccess,
}: {
  mode: 'create' | 'edit';
  initial?: FspInitial;
  onSuccess: () => void;
}) {
  const boundAction =
    mode === 'edit' && initial
      ? updateFspAction.bind(null, initial.id)
      : createFspAction;
  const [state, action, pending] = useActionState<ActionState, FormData>(boundAction, {});

  useEffect(() => {
    if (state.ok) onSuccess();
  }, [state.ok, onSuccess]);

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="smlvDesde">Desde (SMLV) *</Label>
          <Input
            id="smlvDesde"
            name="smlvDesde"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={initial?.smlvDesde ?? ''}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="smlvHasta">Hasta (SMLV)</Label>
          <Input
            id="smlvHasta"
            name="smlvHasta"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initial?.smlvHasta ?? ''}
            placeholder="Sin tope"
            className="mt-1"
          />
          <p className="mt-1 text-[10px] text-slate-400">Vacío = sin límite superior</p>
        </div>
        <div>
          <Label htmlFor="porcentaje">Porcentaje (%) *</Label>
          <Input
            id="porcentaje"
            name="porcentaje"
            type="number"
            step="0.0001"
            min="0"
            max="100"
            required
            defaultValue={initial?.porcentaje ?? ''}
            className="mt-1"
          />
        </div>
      </div>

      {state.error && (
        <Alert variant="danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="gradient" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? 'Guardando…' : mode === 'edit' ? 'Guardar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
