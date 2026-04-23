'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { CarteraEstado } from '@pila/db';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { gestionarLineaAction } from './actions';

type SucursalOpt = { id: string; codigo: string; nombre: string };

export function GestionarLineaButton({
  detalladoId,
  estadoActual,
  sucursalActualId,
  sucursales,
  cotizante,
  periodo,
  valor,
}: {
  detalladoId: string;
  estadoActual: CarteraEstado;
  sucursalActualId: string | null;
  sucursales: SucursalOpt[];
  cotizante: { tipo: string; numero: string; nombre: string };
  periodo: string;
  valor: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <Wrench className="h-3 w-3" />
        Gestionar
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Gestionar línea"
        description={`${cotizante.tipo} ${cotizante.numero} · ${cotizante.nombre} · ${periodo} · $${valor.toLocaleString('es-CO')}`}
        size="md"
      >
        <GestionarForm
          detalladoId={detalladoId}
          estadoActual={estadoActual}
          sucursalActualId={sucursalActualId}
          sucursales={sucursales}
          onClose={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

function GestionarForm({
  detalladoId,
  estadoActual,
  sucursalActualId,
  sucursales,
  onClose,
}: {
  detalladoId: string;
  estadoActual: CarteraEstado;
  sucursalActualId: string | null;
  sucursales: SucursalOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nuevoEstado, setNuevoEstado] = useState<CarteraEstado>(estadoActual);
  const [sucursalId, setSucursalId] = useState<string>(sucursalActualId ?? '');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await gestionarLineaAction(detalladoId, {
        descripcion,
        nuevoEstado: nuevoEstado !== estadoActual ? nuevoEstado : undefined,
        sucursalAsignadaId:
          sucursalId !== (sucursalActualId ?? '')
            ? sucursalId || null
            : undefined,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      router.refresh();
      setTimeout(() => onClose(), 800);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="estado">Nuevo estado</Label>
        <Select
          id="estado"
          value={nuevoEstado}
          onChange={(e) => setNuevoEstado(e.target.value as CarteraEstado)}
          className="mt-1"
        >
          <option value="EN_CONCILIACION">En conciliación</option>
          <option value="CONCILIADA">Conciliada</option>
          <option value="CARTERA_REAL">Cartera real</option>
          <option value="PAGADA_CARTERA_REAL">Pagada (cartera real)</option>
        </Select>
        <p className="mt-1 text-[10px] text-slate-500">
          Estado actual: <strong>{estadoActual}</strong>. Al pasar a{' '}
          <strong>Cartera real</strong> la línea aparece en el
          Administrativo del aliado.
        </p>
      </div>

      <div>
        <Label htmlFor="sucursal">Sucursal asignada</Label>
        <Select
          id="sucursal"
          value={sucursalId}
          onChange={(e) => setSucursalId(e.target.value)}
          className="mt-1"
        >
          <option value="">— Sin asignar —</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.codigo} · {s.nombre}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="descripcion">Descripción de la gestión</Label>
        <textarea
          id="descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          placeholder="Ej. Respondido a la entidad el 23/04; se confirma retiro desde 2026-02."
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
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={pending || !descripcion.trim()}>
          {pending ? 'Guardando…' : 'Registrar gestión'}
        </Button>
      </div>
    </div>
  );
}
