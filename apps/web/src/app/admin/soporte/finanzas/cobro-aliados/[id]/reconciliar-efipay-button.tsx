'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { reconciliarTransaccionEfipayAction } from '@/lib/efipay/reconciliacion';

/**
 * Botón "Marcar como pagada (reconciliación)" para staff. Aparece junto
 * a una transacción Efipay PENDIENTE cuando el webhook nunca llegó pero
 * el aliado dice que ya pagó. Al confirmar, marca la transacción como
 * APROBADA y el cobro como PAGADO, dejando rastro en auditoría.
 */
export function ReconciliarEfipayButton({
  transaccionId,
  consecutivoCobro,
  efipayPaymentId,
}: {
  transaccionId: string;
  consecutivoCobro: string;
  efipayPaymentId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await reconciliarTransaccionEfipayAction(transaccionId, observacion || undefined);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setObservacion('');
        setSuccess(false);
      }, 1000);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100"
        title="Marcar como pagada manualmente (reconciliación)"
      >
        <ShieldCheck className="h-3 w-3" />
        Reconciliar
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Reconciliación manual · ${consecutivoCobro}`}
        description="Solo úsalo si verificaste en Efipay que el pago se aprobó pero el webhook no actualizó nuestro sistema."
        size="md"
      >
        <div className="space-y-4">
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold">Acción irreversible.</p>
              <p className="mt-1">
                Marcará el cobro <strong>{consecutivoCobro}</strong> como PAGADO. Antes verifica en
                el dashboard de Efipay que la transacción
                {efipayPaymentId && (
                  <>
                    {' '}
                    <span className="break-all font-mono">{efipayPaymentId}</span>
                  </>
                )}{' '}
                aparezca como aprobada.
              </p>
            </div>
          </Alert>
          <div>
            <Label htmlFor="observacion">Observación (opcional)</Label>
            <textarea
              id="observacion"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={3}
              placeholder="Ej. Confirmado en dashboard Efipay el 05/05 12:30 — webhook no llegó por configuración pendiente"
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Queda registrado en auditoría junto con tu nombre.
            </p>
          </div>
          {error && (
            <Alert variant="danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-xs">{error}</p>
            </Alert>
          )}
          {success && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <p className="text-xs">Reconciliado.</p>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? 'Reconciliando…' : 'Confirmar reconciliación'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
