'use client';

import { useState, useActionState, useEffect } from 'react';
import { Plus, Pencil, Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createTarifaAction, updateTarifaAction, type ActionState } from './actions';

type Concepto = 'EPS' | 'AFP' | 'ARL' | 'CCF' | 'SENA' | 'ICBF';
type Modalidad = 'DEPENDIENTE' | 'INDEPENDIENTE';
type Nivel = 'I' | 'II' | 'III' | 'IV' | 'V';

export type TarifaInitial = {
  id: string;
  concepto: Concepto;
  modalidad: Modalidad | null;
  nivelRiesgo: Nivel | null;
  exonera: boolean | null;
  porcentaje: number;
  etiqueta: string | null;
  observaciones: string | null;
};

const selectClass =
  'mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm';

export function CreateTarifaButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="gradient" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span>Nueva tarifa</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva tarifa SGSS"
        description="Define un porcentaje y en qué combinación aplica."
        size="md"
      >
        <TarifaForm mode="create" onSuccess={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function EditTarifaButton({ tarifa }: { tarifa: TarifaInitial }) {
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
        title="Editar tarifa"
        description={tarifa.etiqueta ?? tarifa.concepto}
        size="md"
      >
        <TarifaForm mode="edit" initial={tarifa} onSuccess={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function TarifaForm({
  mode,
  initial,
  onSuccess,
}: {
  mode: 'create' | 'edit';
  initial?: TarifaInitial;
  onSuccess: () => void;
}) {
  const boundAction =
    mode === 'edit' && initial
      ? updateTarifaAction.bind(null, initial.id)
      : createTarifaAction;

  const [state, action, pending] = useActionState<ActionState, FormData>(boundAction, {});
  const [concepto, setConcepto] = useState<Concepto>(initial?.concepto ?? 'EPS');

  useEffect(() => {
    if (state.ok) onSuccess();
  }, [state.ok, onSuccess]);

  const mostrarNivel = concepto === 'ARL';
  const mostrarExonera = concepto === 'EPS' || concepto === 'SENA' || concepto === 'ICBF';

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="concepto">Concepto *</Label>
          <select
            id="concepto"
            name="concepto"
            required
            value={concepto}
            onChange={(e) => setConcepto(e.target.value as Concepto)}
            className={selectClass}
          >
            <option value="EPS">EPS — Salud</option>
            <option value="AFP">AFP — Pensión</option>
            <option value="ARL">ARL — Riesgos Laborales</option>
            <option value="CCF">CCF — Caja de Compensación</option>
            <option value="SENA">SENA</option>
            <option value="ICBF">ICBF</option>
          </select>
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
            placeholder="12.5"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="modalidad">Modalidad</Label>
          <select
            id="modalidad"
            name="modalidad"
            defaultValue={initial?.modalidad ?? ''}
            className={selectClass}
          >
            <option value="">— Ambas —</option>
            <option value="DEPENDIENTE">Dependiente</option>
            <option value="INDEPENDIENTE">Independiente</option>
          </select>
        </div>

        {mostrarNivel && (
          <div>
            <Label htmlFor="nivelRiesgo">Nivel ARL *</Label>
            <select
              id="nivelRiesgo"
              name="nivelRiesgo"
              required={mostrarNivel}
              defaultValue={initial?.nivelRiesgo ?? ''}
              className={selectClass}
            >
              <option value="">—</option>
              <option value="I">I</option>
              <option value="II">II</option>
              <option value="III">III</option>
              <option value="IV">IV</option>
              <option value="V">V</option>
            </select>
          </div>
        )}
        {!mostrarNivel && <input type="hidden" name="nivelRiesgo" value="" />}

        {mostrarExonera && (
          <div>
            <Label htmlFor="exonera">Exoneración Ley 1607</Label>
            <select
              id="exonera"
              name="exonera"
              defaultValue={
                initial?.exonera === true
                  ? 'true'
                  : initial?.exonera === false
                    ? 'false'
                    : ''
              }
              className={selectClass}
            >
              <option value="">— No aplica —</option>
              <option value="false">No exonerado</option>
              <option value="true">Exonerado</option>
            </select>
          </div>
        )}
        {!mostrarExonera && <input type="hidden" name="exonera" value="" />}

        <div className="sm:col-span-2">
          <Label htmlFor="etiqueta">Etiqueta (opcional)</Label>
          <Input
            id="etiqueta"
            name="etiqueta"
            defaultValue={initial?.etiqueta ?? ''}
            placeholder="CCF Independiente 2%"
            className="mt-1"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="observaciones">Observaciones (opcional)</Label>
          <textarea
            id="observaciones"
            name="observaciones"
            rows={2}
            defaultValue={initial?.observaciones ?? ''}
            className="mt-1 w-full rounded-xl border border-brand-border bg-brand-surface px-3 py-2 text-sm"
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
          {pending ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear tarifa'}
        </Button>
      </div>
    </form>
  );
}
