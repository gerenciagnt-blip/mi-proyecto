'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import {
  reconciliarTodasPendientesAction,
  type ReconciliarMasivoResult,
} from '@/lib/efipay/reconciliacion';

/**
 * Botón "Reconciliar pagos Efipay" — consulta a Efipay el estado real
 * de TODAS las transacciones PENDIENTE y actualiza los cobros que ya
 * tengan pago aprobado en la pasarela.
 *
 * Útil cuando el webhook no llega (URL pública mal configurada en dev)
 * y los pagos quedan estancados en PENDIENTE.
 *
 * El cron interno (instrumentation.ts) hace lo mismo cada 5 min en
 * background — este botón es solo para forzar manualmente.
 */
export function ReconciliarMasivoButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReconciliarMasivoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function ejecutar() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await reconciliarTodasPendientesAction({
          requireSession: true,
          maxAgeDias: 30,
        });
        setResult(r);
        if (r.aprobadas > 0 || r.rechazadas > 0 || r.expiradas > 0) {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setResult(null);
          setError(null);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50"
        title="Consulta a Efipay y actualiza los pagos PENDIENTE que ya están aprobados en la pasarela"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Reconciliar pagos Efipay
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Reconciliar pagos Efipay"
        description="Consulta a la pasarela el estado real de las transacciones PENDIENTE y actualiza los cobros que ya tengan pago aprobado."
        size="md"
      >
        <div className="space-y-4">
          {!result && !error && (
            <p className="text-xs text-slate-600">
              Esto consulta hasta <strong>200 transacciones</strong> de los últimos 30 días en
              estado PENDIENTE. Para cada una, pregunta a Efipay su estado real y, si es APROBADA,
              marca el cobro como PAGADO. La operación es idempotente — puedes ejecutarla cuantas
              veces quieras.
            </p>
          )}

          {result && (
            <div className="space-y-3">
              <Alert variant="success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <p className="text-xs font-medium">
                  Reconciliación completada · {result.consultadas} transacción
                  {result.consultadas !== 1 ? 'es' : ''} consultada
                  {result.consultadas !== 1 ? 's' : ''}
                </p>
              </Alert>
              <ul className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <Stat label="Aprobadas (cobro → PAGADO)" value={result.aprobadas} tone="emerald" />
                <Stat label="Rechazadas" value={result.rechazadas} tone="rose" />
                <Stat label="Expiradas" value={result.expiradas} tone="slate" />
                <Stat label="Sin cambio (siguen PENDIENTE)" value={result.sinCambio} tone="slate" />
                <Stat label="Fallos al consultar" value={result.fallos} tone="amber" />
              </ul>
              {result.fallos > 0 && (
                <details className="text-[10px]">
                  <summary className="cursor-pointer text-slate-600">
                    Ver detalle de los {result.fallos} fallo
                    {result.fallos !== 1 ? 's' : ''}
                  </summary>
                  <ul className="mt-1 max-h-40 overflow-y-auto space-y-0.5 rounded bg-rose-50 p-2 font-mono">
                    {result.errores.map((e, i) => (
                      <li key={i} className="text-rose-800">
                        <strong>{e.referencia}</strong>: {e.error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {error && (
            <Alert variant="danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-xs">{error}</p>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cerrar
            </Button>
            <Button onClick={ejecutar} disabled={pending}>
              {pending
                ? 'Consultando…'
                : result
                  ? 'Reconciliar de nuevo'
                  : 'Iniciar reconciliación'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'rose' | 'slate' | 'amber';
}) {
  const colors = {
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
    slate: 'text-slate-600',
    amber: 'text-amber-700',
  } as const;
  return (
    <li className="flex items-center justify-between">
      <span className="text-slate-700">{label}</span>
      <span className={`font-mono font-semibold ${colors[tone]}`}>{value}</span>
    </li>
  );
}
