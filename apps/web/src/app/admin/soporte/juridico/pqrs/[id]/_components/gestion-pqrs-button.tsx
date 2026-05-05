'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ListChecks, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { PqrsEstado } from '@pila/db';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { gestionPqrsAction } from '../actions';

const ESTADOS: Array<{ value: PqrsEstado; label: string }> = [
  { value: 'RECIBIDA', label: 'Recibida' },
  { value: 'EN_TRAMITE', label: 'En trámite' },
  { value: 'RESPONDIDA', label: 'Respondida' },
  { value: 'CERRADA', label: 'Cerrada' },
  { value: 'RECHAZADA', label: 'Rechazada' },
];

/**
 * Gestión libre de la PQRS — cambiar estado o solo añadir nota interna
 * a la bitácora.
 *
 * Para la respuesta formal al solicitante (con notificación email/WA)
 * usa `<ResponderPqrsButton>`.
 */
export function GestionPqrsButton({
  pqrsId,
  estadoActual,
  consecutivo,
}: {
  pqrsId: string;
  estadoActual: PqrsEstado;
  consecutivo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [nuevoEstado, setNuevoEstado] = useState<PqrsEstado>(
    estadoActual === 'RECIBIDA' ? 'EN_TRAMITE' : estadoActual,
  );
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
      const fd = new FormData();
      fd.set('pqrsId', pqrsId);
      fd.set('descripcion', descripcion);
      if (nuevoEstado !== estadoActual) fd.set('nuevoEstado', nuevoEstado);
      const r = await gestionPqrsAction({}, fd);
      if (r.error) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setDescripcion('');
        setSuccess(false);
      }, 800);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <ListChecks className="h-3.5 w-3.5" />
        Cambiar estado / nota
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Gestionar PQRS · ${consecutivo}`}
        description="Registra una nota interna en la bitácora y, si corresponde, cambia el estado del caso."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="estado">Estado</Label>
            <Select
              id="estado"
              value={nuevoEstado}
              onChange={(e) => setNuevoEstado(e.target.value as PqrsEstado)}
              className="mt-1"
            >
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[10px] text-slate-500">
              Actual: <strong>{estadoActual.replaceAll('_', ' ').toLowerCase()}</strong>. Si dejas
              el mismo, solo se registra la nota.
            </p>
          </div>
          <div>
            <Label htmlFor="descripcion">Descripción / nota interna</Label>
            <textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
              placeholder="Ej. Asignado al área administrativa para verificación de la información..."
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Esta nota es interna — no se envía al solicitante. Para responder formalmente usa el
              botón &quot;Responder al solicitante&quot;.
            </p>
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
              {pending ? 'Guardando…' : 'Registrar'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
