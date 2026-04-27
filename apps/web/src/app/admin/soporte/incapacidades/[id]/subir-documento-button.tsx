'use client';

/**
 * Sprint Soporte reorg fase 2 — Botón + modal para que soporte adjunte
 * documentos a una incapacidad ya radicada (resolución EPS, comprobante
 * de pago, autorización del médico, etc.). Antes esto solo se podía
 * hacer desde finanzas/movimientos-incapacidades, lo cual era confuso.
 */

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, Plus, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { DOC_TIPO_LABEL } from '@/lib/incapacidades/validations';
import { subirDocumentoSoporteIncapAction, type ActionState } from '../actions';

export function SubirDocumentoSoporteButton({ incapacidadId }: { incapacidadId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-blue bg-white px-3 text-xs font-medium text-brand-blue shadow-sm transition hover:bg-brand-blue/5"
      >
        <Plus className="h-3.5 w-3.5" />
        Adjuntar documento
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Adjuntar documento de soporte"
        description="Resolución EPS, comprobante de pago, autorización médica, etc."
        size="md"
      >
        <SubirForm incapacidadId={incapacidadId} onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function SubirForm({ incapacidadId, onClose }: { incapacidadId: string; onClose: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    subirDocumentoSoporteIncapAction,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      const t = setTimeout(() => {
        onClose();
      }, 700);
      return () => clearTimeout(t);
    }
  }, [state.ok, onClose, router]);

  return (
    <form ref={formRef} action={submit} className="space-y-3">
      <input type="hidden" name="incapacidadId" value={incapacidadId} />

      <div>
        <Label htmlFor="tipo">
          Tipo de documento <span className="text-red-500">*</span>
        </Label>
        <select
          id="tipo"
          name="tipo"
          required
          defaultValue=""
          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
        >
          <option value="" disabled>
            — Selecciona —
          </option>
          {(Object.keys(DOC_TIPO_LABEL) as Array<keyof typeof DOC_TIPO_LABEL>).map((k) => (
            <option key={k} value={k}>
              {DOC_TIPO_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="archivo">
          Archivo <span className="text-red-500">*</span>
        </Label>
        <input
          id="archivo"
          name="archivo"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
          required
          className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <p className="mt-1 text-[10px] text-slate-400">PDF o imagen, máximo 5 MB.</p>
      </div>

      {state.error && (
        <Alert variant="danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}
      {state.ok && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Documento adjuntado.</span>
        </Alert>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" type="button" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Subiendo…
            </>
          ) : (
            <>
              <Paperclip className="h-3.5 w-3.5" />
              Adjuntar
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
