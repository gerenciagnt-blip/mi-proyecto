'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, AlertTriangle, CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { responderPqrsAction } from '../actions';

/**
 * Botón "Responder al solicitante" — escribe respuesta formal y la
 * envía por email/WhatsApp (stubs por ahora, ver `lib/pqrs/notificaciones.ts`).
 *
 * Marca la PQRS como RESPONDIDA. Opcionalmente puede cerrarla en el mismo
 * paso (CERRADA) si ya no espera más interacción.
 */
export function ResponderPqrsButton({
  pqrsId,
  consecutivo,
  emailSolicitante,
  yaTieneRespuesta,
}: {
  pqrsId: string;
  consecutivo: string;
  emailSolicitante: string;
  yaTieneRespuesta: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [respuesta, setRespuesta] = useState('');
  const [cerrar, setCerrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function submit() {
    if (respuesta.trim().length < 20) {
      setError('La respuesta debe tener al menos 20 caracteres.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('pqrsId', pqrsId);
      fd.set('respuesta', respuesta);
      if (cerrar) fd.set('marcarComoCerrada', 'on');
      const r = await responderPqrsAction({}, fd);
      if (r.error) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setRespuesta('');
        setSuccess(false);
      }, 1200);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-blue px-3 text-xs font-medium text-white hover:bg-brand-blue/90"
      >
        <Send className="h-3.5 w-3.5" />
        {yaTieneRespuesta ? 'Editar respuesta' : 'Responder al solicitante'}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Responder PQRS · ${consecutivo}`}
        description="La respuesta se enviará al solicitante por email y WhatsApp y queda registrada en la bitácora."
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <Mail className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
            Se notificará a <strong className="font-mono">{emailSolicitante}</strong>
          </div>
          <div>
            <Label htmlFor="respuesta">Respuesta formal</Label>
            <textarea
              id="respuesta"
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              rows={10}
              placeholder="Estimado(a) solicitante,&#10;&#10;En relación con su PQRS, le informamos que..."
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Mínimo 20 caracteres. Sé claro, formal y específico.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={cerrar}
              onChange={(e) => setCerrar(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue/40"
            />
            <span className="text-slate-700">
              Cerrar PQRS al enviar la respuesta
              <span className="ml-1 text-xs text-slate-500">
                (marca el caso como CERRADA — ya no se podrá editar)
              </span>
            </span>
          </label>
          {error && (
            <Alert variant="danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p>{error}</p>
            </Alert>
          )}
          {success && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <p>Respuesta enviada al solicitante.</p>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || respuesta.trim().length < 20}>
              {pending ? 'Enviando…' : cerrar ? 'Responder y cerrar' : 'Enviar respuesta'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
