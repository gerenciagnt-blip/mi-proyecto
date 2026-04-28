'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Scale, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { IncapacidadEstado } from '@pila/db';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { gestionJuridicoIncapAction } from '../actions';

/**
 * Estados que el área jurídica puede asignar desde su bandeja:
 *   - `EN_PROCESO_JURIDICO` — confirma que el caso está siendo gestionado
 *     activamente (envío impugnación, espera respuesta, etc.).
 *   - `APROBADA / PAGADA / RECHAZADA` — cierre del proceso. Si la entidad
 *     paga tras la impugnación, jurídico marca PAGADA. Si finalmente la
 *     niegan, jurídico marca RECHAZADA. APROBADA queda como paso intermedio
 *     si el cierre es parcial (la entidad reconoce pero aún no paga).
 *
 * `TRASLADO_A_JURIDICO` no se permite cambiar a sí mismo desde acá — el
 * caso ya está trasladado, no tiene sentido reasignar.
 */
const ESTADOS_JURIDICO: Array<{ value: IncapacidadEstado; label: string }> = [
  { value: 'EN_PROCESO_JURIDICO', label: 'En proceso jurídico' },
  { value: 'APROBADA', label: 'Aprobada (cerrar caso)' },
  { value: 'PAGADA', label: 'Pagada (cerrar caso)' },
  { value: 'RECHAZADA', label: 'Rechazada (cerrar caso)' },
];

export function GestionJuridicoButton({
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

  // Estado inicial: si veníamos de TRASLADO_A_JURIDICO, sugerimos
  // EN_PROCESO_JURIDICO. Si ya estaba en proceso, el dropdown queda en
  // ese mismo valor (el operador puede dejarlo sin cambio + solo añadir
  // gestión, o moverlo a cierre).
  const [nuevoEstado, setNuevoEstado] = useState<IncapacidadEstado>(
    estadoActual === 'TRASLADO_A_JURIDICO' ? 'EN_PROCESO_JURIDICO' : estadoActual,
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
      const r = await gestionJuridicoIncapAction(incapacidadId, {
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
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700"
      >
        <Scale className="h-3.5 w-3.5" />
        Gestionar jurídico
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Gestión jurídica · ${consecutivo}`}
        description="Registra una actuación legal y, si corresponde, cambia el estado del caso."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="estado">Estado del caso</Label>
            <Select
              id="estado"
              value={nuevoEstado}
              onChange={(e) => setNuevoEstado(e.target.value as IncapacidadEstado)}
              className="mt-1"
            >
              {ESTADOS_JURIDICO.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[10px] text-slate-500">
              Estado actual: <strong>{estadoActual.replaceAll('_', ' ').toLowerCase()}</strong>. Si
              dejas el mismo, solo se registra la gestión sin cambiar estado.
            </p>
          </div>
          <div>
            <Label htmlFor="descripcion">Descripción de la actuación</Label>
            <textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
              placeholder="Ej. Se radicó impugnación ante la EPS el 25/04 con argumentos del Decreto 780/2016. Se anexa carta firmada."
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-[3px] focus:ring-indigo-500/15"
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
