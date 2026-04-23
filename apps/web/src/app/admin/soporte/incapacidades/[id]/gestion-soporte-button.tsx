'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { IncapacidadEstado } from '@pila/db';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { gestionSoporteIncapAction } from '../actions';

const ESTADOS: Array<{ value: IncapacidadEstado; label: string }> = [
  { value: 'RADICADA', label: 'Radicada' },
  { value: 'EN_REVISION', label: 'En revisión' },
  { value: 'APROBADA', label: 'Aprobada' },
  { value: 'PAGADA', label: 'Pagada' },
  { value: 'RECHAZADA', label: 'Rechazada' },
];

export function GestionSoporteIncapButton({
  incapacidadId,
  estadoActual,
  consecutivo,
}: {
  incapacidadId: string;
  estadoActual: IncapacidadEstado;
  consecutivo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [nuevoEstado, setNuevoEstado] = useState<IncapacidadEstado>(estadoActual);
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function submit() {
    if (!descripcion.trim()) {
      setError('La descripción es obligatoria.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await gestionSoporteIncapAction(incapacidadId, {
        descripcion,
        nuevoEstado: nuevoEstado !== estadoActual ? nuevoEstado : undefined,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      router.refresh();
      setTimeout(() => setOpen(false), 800);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-blue px-3 text-xs font-medium text-white hover:bg-brand-blue-dark"
      >
        <Wrench className="h-3.5 w-3.5" />
        Gestionar
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Gestionar ${consecutivo}`}
        description="Actualiza el estado y deja nota de la gestión."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="estado">Nuevo estado</Label>
            <Select
              id="estado"
              value={nuevoEstado}
              onChange={(e) => setNuevoEstado(e.target.value as IncapacidadEstado)}
              className="mt-1"
            >
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[10px] text-slate-500">
              Estado actual: <strong>{estadoActual}</strong>
            </p>
          </div>
          <div>
            <Label htmlFor="descripcion">Descripción de la gestión</Label>
            <textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              placeholder="Ej. Radicada en EPS el 24/04; se espera respuesta en 5 días hábiles."
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
            />
          </div>
          {error && (
            <Alert variant="danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p>{error}</p>
            </Alert>
          )}
          {success && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <p>Gestión registrada.</p>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || !descripcion.trim()}>
              {pending ? 'Guardando…' : 'Registrar gestión'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
