'use client';

import { useState, useTransition } from 'react';
import { Lock, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { cerrarPeriodoMasivoAction } from './actions';

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

type Props = {
  periodoId: string;
  periodoLabel: string;
  habilitado: boolean;
  diasRestantes: number;
  cotizantesPendientes: number;
  totalPendiente: number;
};

export function CerrarPeriodoButton({
  periodoId,
  periodoLabel,
  habilitado,
  diasRestantes,
  cotizantesPendientes,
  totalPendiente,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const onConfirm = () => {
    setError(null);
    setMensaje(null);
    start(async () => {
      const r = await cerrarPeriodoMasivoAction(periodoId);
      if (r.error) {
        setError(r.error);
      } else if (r.ok) {
        setMensaje(r.mensaje ?? 'Período cerrado');
        setTimeout(() => setOpen(false), 2000);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!habilitado}
        title={
          habilitado
            ? `Cerrar período ${periodoLabel}`
            : `Se habilita faltando 8 días para acabarse el mes (actualmente faltan ${diasRestantes})`
        }
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
          habilitado
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'cursor-not-allowed bg-slate-100 text-slate-400'
        }`}
      >
        <Lock className="h-3.5 w-3.5" />
        Cerrar período
      </button>

      {open && (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={`Cerrar período ${periodoLabel}`}
          description="Genera factura automática a los cotizantes sin movimiento y los inactiva."
          size="md"
        >
          <div className="space-y-4">
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Acción masiva irreversible</p>
                <p className="mt-1 text-xs">
                  Se generarán comprobantes automáticos para{' '}
                  <strong>{cotizantesPendientes}</strong>{' '}
                  {cotizantesPendientes === 1 ? 'cotizante' : 'cotizantes'} pendientes:
                </p>
                <ul className="mt-2 ml-4 list-disc space-y-0.5 text-[11px]">
                  <li>Liquidación SGSS sobre <strong>1 día</strong></li>
                  <li>Valor administración <strong>$0</strong></li>
                  <li>Servicios adicionales normales</li>
                  <li>
                    <strong>Novedad de retiro</strong> — los cotizantes quedarán inactivos
                  </li>
                </ul>
                <p className="mt-2 text-[11px]">
                  Cada factura puede anularse después para emitir una factura normal si el
                  cotizante debe continuar.
                </p>
              </div>
            </Alert>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Cotizantes pendientes</span>
                <span className="font-mono font-bold">{cotizantesPendientes}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-slate-500">Total estimado a generar</span>
                <span className="font-mono font-bold text-brand-blue-dark">
                  {copFmt.format(totalPendiente)}
                </span>
              </div>
            </div>

            {error && (
              <Alert variant="danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </Alert>
            )}
            {mensaje && (
              <Alert variant="success">
                <Lock className="h-4 w-4 shrink-0" />
                <span>{mensaje}</span>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={onConfirm}
                disabled={pending || !!mensaje}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                {pending ? 'Cerrando…' : 'Sí, cerrar período'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
