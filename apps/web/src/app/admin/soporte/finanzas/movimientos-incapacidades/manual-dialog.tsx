'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { crearMovimientoManualAction, type ActionState } from './actions';

/**
 * Botón + dialog para registrar manualmente un movimiento bancario
 * cuando el extracto no se puede importar (PDF escaneado, formato
 * propietario, ajustes contables puntuales, etc.).
 */
export function RegistroManualButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-blue bg-white px-3 text-xs font-medium text-brand-blue shadow-sm transition hover:bg-brand-blue/5"
      >
        <Plus className="h-3.5 w-3.5" />
        Registro manual
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar movimiento manual"
        description="Para casos donde el extracto no se puede importar (PDF escaneado, ajustes contables, etc)."
        size="md"
      >
        <ManualForm onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function ManualForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    crearMovimientoManualAction,
    {},
  );

  // Cerrar el dialog ~700ms después de éxito y refrescar la lista.
  useEffect(() => {
    if (state.ok) {
      router.refresh();
      const t = setTimeout(() => onClose(), 700);
      return () => clearTimeout(t);
    }
  }, [state.ok, onClose, router]);

  // Default fecha: hoy (YYYY-MM-DD)
  const hoy = new Date();
  const today = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

  return (
    <form ref={formRef} action={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="fechaIngreso">
            Fecha <span className="text-red-500">*</span>
          </Label>
          <Input
            id="fechaIngreso"
            name="fechaIngreso"
            type="date"
            required
            defaultValue={today}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="bancoOrigen">Banco</Label>
          <Input
            id="bancoOrigen"
            name="bancoOrigen"
            placeholder="Bancolombia, Davivienda…"
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="concepto">
          Concepto <span className="text-red-500">*</span>
        </Label>
        <Input
          id="concepto"
          name="concepto"
          required
          minLength={3}
          maxLength={500}
          placeholder="Ej. Abono incapacidad EPS Sura — autorización 12345"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="valor">
          Valor (COP) <span className="text-red-500">*</span>
        </Label>
        <Input
          id="valor"
          name="valor"
          type="number"
          step="1"
          min="1"
          required
          placeholder="1234567"
          className="mt-1"
        />
        <p className="mt-1 text-[10px] text-slate-400">
          Solo enteros. No incluyas $ ni puntos miles — el sistema formatea.
        </p>
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
          <span>Movimiento registrado.</span>
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
              Guardando…
            </>
          ) : (
            'Registrar movimiento'
          )}
        </Button>
      </div>
    </form>
  );
}
