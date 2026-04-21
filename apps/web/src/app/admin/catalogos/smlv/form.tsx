'use client';

import { useActionState } from 'react';
import { DollarSign, TriangleAlert, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { saveSmlvAction, type ActionState } from './actions';

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function SmlvForm({
  valorActual,
  afiliacionesPorDebajo,
}: {
  valorActual: number;
  afiliacionesPorDebajo: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSmlvAction, {});

  return (
    <form action={action} className="space-y-5">
      <div className="flex items-start gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10">
          <DollarSign className="h-5 w-5 text-brand-blue" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Valor actual
          </p>
          <p className="mt-0.5 font-heading text-2xl font-bold text-slate-900">
            {copFmt.format(valorActual)}
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="valor">Nuevo valor (COP mensual)</Label>
        <Input
          id="valor"
          name="valor"
          type="number"
          required
          min="1"
          step="1"
          defaultValue={valorActual}
          className="mt-1"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Digita el valor del nuevo SMLV. Al guardar, todas las afiliaciones con salario{' '}
          <strong>inferior</strong> al nuevo valor serán actualizadas automáticamente.
        </p>
      </div>

      {afiliacionesPorDebajo > 0 && (
        <Alert variant="warning">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span>
            Hay <strong>{afiliacionesPorDebajo}</strong> afiliaciones con salario inferior al valor
            actual. Si subes el SMLV, se ajustarán automáticamente.
          </span>
        </Alert>
      )}

      {state.error && <Alert variant="danger">{state.error}</Alert>}
      {state.ok && (
        <Alert variant="success">
          SMLV actualizado. Se ajustaron {state.afectadas ?? 0} afiliaciones.
        </Alert>
      )}

      <Button type="submit" variant="gradient" disabled={pending}>
        <Save className="h-4 w-4" />
        {pending ? 'Guardando…' : 'Guardar SMLV'}
      </Button>
    </form>
  );
}
