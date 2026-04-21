'use client';

import { useState, useActionState, useEffect } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { abrirPeriodoAction, type ActionState } from './actions';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function AbrirPeriodoDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    abrirPeriodoAction,
    {},
  );

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  const now = new Date();

  return (
    <>
      <Button variant="gradient" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span>Abrir período</span>
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Abrir período contable"
        description="El SMLV vigente queda guardado en el período para mantener estabilidad en el cálculo."
        size="sm"
      >
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="anio">Año *</Label>
              <Input
                id="anio"
                name="anio"
                type="number"
                required
                min={2020}
                max={2100}
                defaultValue={now.getFullYear()}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="mes">Mes *</Label>
              <select
                id="mes"
                name="mes"
                required
                defaultValue={now.getMonth() + 1}
                className="mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm"
              >
                {MESES.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {String(i + 1).padStart(2, '0')} — {m}
                  </option>
                ))}
              </select>
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
              {pending ? 'Abriendo…' : 'Abrir período'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
