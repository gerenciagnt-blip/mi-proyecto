'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, CheckCircle2, AlertTriangle, RotateCcw, Banknote } from 'lucide-react';
import type { CarteraEstado } from '@pila/db';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { ESTADO_LINEA_LABEL } from '@/lib/cartera/labels';
import { gestionarCarteraAliadoAction } from './actions';

export function GestionarAliadoButton({
  detalladoId,
  estadoActual,
  cotizante,
  periodo,
  valor,
  gestionesCount,
}: {
  detalladoId: string;
  estadoActual: CarteraEstado;
  cotizante: { tipo: string; numero: string; nombre: string };
  periodo: string;
  valor: number;
  gestionesCount: number;
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
        {gestionesCount > 0 && (
          <span className="ml-0.5 rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-600">
            {gestionesCount}
          </span>
        )}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Gestionar línea de cartera"
        description={`${cotizante.tipo} ${cotizante.numero} · ${cotizante.nombre} · ${periodo} · $${valor.toLocaleString('es-CO')}`}
        size="md"
      >
        <GestionForm
          detalladoId={detalladoId}
          estadoActual={estadoActual}
          onClose={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

function GestionForm({
  detalladoId,
  estadoActual,
  onClose,
}: {
  detalladoId: string;
  estadoActual: CarteraEstado;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function submit(accion: 'nota' | 'marcar-pagada' | 'revertir-pago') {
    if (!descripcion.trim()) {
      setError('La descripción es obligatoria — describe la acción tomada.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await gestionarCarteraAliadoAction(detalladoId, {
        descripcion,
        marcarPagada:
          accion === 'marcar-pagada' ? true : accion === 'revertir-pago' ? false : undefined,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setSuccess(
        accion === 'marcar-pagada'
          ? 'Marcada como pagada.'
          : accion === 'revertir-pago'
            ? 'Pago revertido.'
            : 'Nota registrada.',
      );
      router.refresh();
      setTimeout(() => onClose(), 800);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        Estado actual:{' '}
        <strong className="text-slate-900">{ESTADO_LINEA_LABEL[estadoActual]}</strong>
      </div>

      <div>
        <Label htmlFor="descripcion">Descripción (obligatoria)</Label>
        <textarea
          id="descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          placeholder="Ej. Pagado vía PSE con referencia 1234; soporte por email."
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
          <p>{success}</p>
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button variant="outline" onClick={() => submit('nota')} disabled={pending}>
          Solo registrar nota
        </Button>
        {(estadoActual === 'MORA_REAL' || estadoActual === 'CARTERA_REAL') && (
          <Button onClick={() => submit('marcar-pagada')} disabled={pending}>
            <Banknote className="h-3.5 w-3.5" />
            Marcar como pagada
          </Button>
        )}
        {estadoActual === 'PAGADA_CARTERA_REAL' && (
          <Button variant="danger" onClick={() => submit('revertir-pago')} disabled={pending}>
            <RotateCcw className="h-3.5 w-3.5" />
            Revertir pago
          </Button>
        )}
      </div>
    </div>
  );
}
