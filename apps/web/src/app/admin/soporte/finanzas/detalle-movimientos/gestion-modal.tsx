'use client';

/**
 * Sprint Soporte reorg — Modal de gestión de un detalle de movimiento.
 * Form con: fecha de pago, medio (efectivo/transferencia), # transacción,
 * empresa pagadora, estado (Pendiente/En proceso/Pagada/Devuelta),
 * observaciones, soporte (file).
 *
 * Reglas:
 * - Si medio = TRANSFERENCIA, # transacción es obligatorio.
 * - Si estado = PAGADA, exigimos medio + fecha (validación server).
 */

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { gestionarDetalleMovimientoAction, type ActionState } from './actions';

export type EmpresaOpt = { id: string; nit: string; nombre: string };

export type DetalleActual = {
  id: string;
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'PAGADA' | 'DEVUELTA';
  fechaPago: string | null; // ISO
  medioPago: 'EFECTIVO' | 'TRANSFERENCIA' | null;
  numeroTransaccion: string | null;
  pagadoConEmpresaId: string | null;
  observaciones: string | null;
};

export function GestionButton({
  detalle,
  empresas,
}: {
  detalle: DetalleActual;
  empresas: EmpresaOpt[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-brand-blue bg-brand-blue px-2 text-[10px] font-medium text-white hover:bg-brand-blue-dark"
        title="Gestionar pago"
      >
        <Settings2 className="h-3 w-3" />
        Gestión
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Gestionar pago"
        description="Registra fecha, medio, # de transacción, empresa, estado y soporte."
        size="md"
      >
        <GestionForm detalle={detalle} empresas={empresas} onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function GestionForm({
  detalle,
  empresas,
  onClose,
}: {
  detalle: DetalleActual;
  empresas: EmpresaOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const bound = gestionarDetalleMovimientoAction.bind(null, detalle.id);
  const [state, submit, pending] = useActionState<ActionState, FormData>(bound, {});

  // Tracking del medio para mostrar/ocultar # transacción
  const [medioPago, setMedioPago] = useState<'' | 'EFECTIVO' | 'TRANSFERENCIA'>(
    detalle.medioPago ?? '',
  );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      const t = setTimeout(() => onClose(), 700);
      return () => clearTimeout(t);
    }
  }, [state.ok, onClose, router]);

  const fechaIso = detalle.fechaPago ? new Date(detalle.fechaPago).toISOString().slice(0, 10) : '';

  const requiereTransaccion = medioPago === 'TRANSFERENCIA';

  return (
    <form action={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="fechaPago">Fecha de pago</Label>
          <Input
            id="fechaPago"
            name="fechaPago"
            type="date"
            defaultValue={fechaIso}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="medioPago">Forma de pago</Label>
          <select
            id="medioPago"
            name="medioPago"
            value={medioPago}
            onChange={(e) => setMedioPago(e.target.value as '' | 'EFECTIVO' | 'TRANSFERENCIA')}
            className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
          >
            <option value="">— Sin definir —</option>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="numeroTransaccion">
          Número de transacción
          {requiereTransaccion ? (
            <span className="text-red-500"> *</span>
          ) : (
            <span className="ml-1 text-[10px] font-normal text-slate-400">
              (opcional para efectivo)
            </span>
          )}
        </Label>
        <Input
          id="numeroTransaccion"
          name="numeroTransaccion"
          maxLength={120}
          defaultValue={detalle.numeroTransaccion ?? ''}
          required={requiereTransaccion}
          placeholder="Ref. bancaria o # de comprobante"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="pagadoConEmpresaId">Empresa planilla (pagadora)</Label>
        <select
          id="pagadoConEmpresaId"
          name="pagadoConEmpresaId"
          defaultValue={detalle.pagadoConEmpresaId ?? ''}
          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
        >
          <option value="">— Sin asignar —</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre} (NIT {e.nit})
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-slate-400">
          La empresa por la que sale el pago al cotizante.
        </p>
      </div>

      <div>
        <Label htmlFor="estado">
          Estado <span className="text-red-500">*</span>
        </Label>
        <select
          id="estado"
          name="estado"
          defaultValue={detalle.estado}
          required
          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
        >
          <option value="PENDIENTE">Pendiente</option>
          <option value="EN_PROCESO">En proceso</option>
          <option value="PAGADA">Pagada</option>
          <option value="DEVUELTA">Devuelta</option>
        </select>
        <p className="mt-1 text-[10px] text-slate-400">
          PAGADA exige medio + fecha. DEVUELTA registra rechazos del banco (cuenta cerrada, datos
          errados).
        </p>
      </div>

      <div>
        <Label htmlFor="soporte">Cargue de soporte</Label>
        <input
          id="soporte"
          name="soporte"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <p className="mt-1 text-[10px] text-slate-400">
          PDF o imagen, máx. 5 MB. Se agrega a los soportes existentes (no reemplaza).
        </p>
      </div>

      <div>
        <Label htmlFor="observaciones">Observaciones</Label>
        <textarea
          id="observaciones"
          name="observaciones"
          rows={3}
          maxLength={1000}
          defaultValue={detalle.observaciones ?? ''}
          placeholder="Notas internas — visible solo para staff"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
        />
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
          <span>Gestión guardada.</span>
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
            'Guardar gestión'
          )}
        </Button>
      </div>
    </form>
  );
}
