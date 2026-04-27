'use client';

/**
 * Sprint Soporte reorg fase 2 — Botones para transicionar el estado del
 * CONSOLIDADO (no de las líneas individuales). El flujo es:
 *
 *   EN_CONCILIACION → ENVIADA → CONCILIADA
 *
 * - "Marcar como Enviada": cuando soporte ya respondió a la entidad SGSS
 *   con la conciliación (líneas pagadas / mora justificada).
 * - "Marcar como Conciliada": cuando la entidad confirma el cierre.
 *
 * Cualquier transición pide una descripción y registra una `CarteraGestion`
 * global (sin `detalladoId` específico — campo nullable que indica que
 * aplica al consolidado entero).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, CheckCircle2, Loader2, AlertTriangle, X } from 'lucide-react';
import type { CarteraEstado } from '@pila/db';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { transicionarConsolidadoAction } from './actions';

export function TransicionConsolidadoButtons({
  consolidadoId,
  estadoActual,
}: {
  consolidadoId: string;
  estadoActual: CarteraEstado;
}) {
  // Solo aplica al flujo del consolidado: si la línea está en estados como
  // MORA_REAL/CARTERA_REAL, esos son a nivel línea, no consolidado.
  const puedeEnviar = estadoActual === 'EN_CONCILIACION';
  const puedeConciliar = estadoActual === 'ENVIADA';

  if (!puedeEnviar && !puedeConciliar) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {puedeEnviar && (
        <TransicionDialog
          consolidadoId={consolidadoId}
          target="ENVIADA"
          label="Marcar como Enviada"
          icon={<Send className="h-3.5 w-3.5" />}
          tone="amber"
          ayuda="Usa esto cuando ya respondiste a la entidad SGSS con la conciliación de este lote."
        />
      )}
      {puedeConciliar && (
        <TransicionDialog
          consolidadoId={consolidadoId}
          target="CONCILIADA"
          label="Marcar como Conciliada"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          tone="emerald"
          ayuda="Usa esto cuando la entidad SGSS confirmó el cierre de este lote."
        />
      )}
    </div>
  );
}

function TransicionDialog({
  consolidadoId,
  target,
  label,
  icon,
  tone,
  ayuda,
}: {
  consolidadoId: string;
  target: 'ENVIADA' | 'CONCILIADA';
  label: string;
  icon: React.ReactNode;
  tone: 'amber' | 'emerald';
  ayuda: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const triggerCls =
    tone === 'amber'
      ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
      : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';

  function submit() {
    if (!descripcion.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await transicionarConsolidadoAction(consolidadoId, target, descripcion);
      if (r.error) {
        setError(r.error);
        return;
      }
      setOk(true);
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setOk(false);
        setDescripcion('');
      }, 700);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ' +
          triggerCls
        }
      >
        {icon}
        {label}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description={ayuda}
        size="md"
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="desc">Observación / referencia</Label>
            <textarea
              id="desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={
                target === 'ENVIADA'
                  ? 'Ej: Respondida vía correo a la entidad el 27/04/2026 con copia de pagos y soportes de mora.'
                  : 'Ej: Entidad confirmó conciliación cerrada vía email del 28/04/2026.'
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
            />
          </div>

          {error && (
            <Alert variant="danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </Alert>
          )}
          {ok && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Estado del consolidado actualizado.</span>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              <X className="h-3.5 w-3.5" />
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || !descripcion.trim()}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
              Confirmar
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
