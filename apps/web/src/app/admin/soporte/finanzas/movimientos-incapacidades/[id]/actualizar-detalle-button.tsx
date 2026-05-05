'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { actualizarDetalleAction, type ActionState } from './actions';

type Detalle = {
  id: string;
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'PAGADA' | 'DEVUELTA';
  fechaPago: Date | null;
  pagadoConEmpresaId: string | null;
  observaciones: string | null;
  nombreCompleto: string;
  numeroDocumento: string;
};

/**
 * Botón "Actualizar" en cada fila de la tabla de detalles. Abre dialog con
 * form para cambiar estado (PENDIENTE/EN_PROCESO/PAGADA), fecha de pago,
 * empresa con la que se pagó (cuando aplica) y observaciones.
 *
 * NOTA: la action server-side soporta DEVUELTA pero el form solo expone
 * los 3 estados del flujo normal — DEVUELTA es excepcional y se maneja
 * vía DB/escalado por ahora. Si se necesita exponerlo, agregar la
 * opción al select.
 */
export function ActualizarDetalleButton({
  detalle,
  empresas,
}: {
  detalle: Detalle;
  empresas: Array<{ id: string; nombre: string }>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const submitBound = actualizarDetalleAction.bind(null, detalle.id);
  const [state, submit, pending] = useActionState<ActionState, FormData>(submitBound, {});

  useEffect(() => {
    if (state.ok && open) {
      router.refresh();
      setOpen(false);
    }
  }, [state.ok, open, router]);

  const fechaPagoIso = detalle.fechaPago ? detalle.fechaPago.toISOString().slice(0, 10) : '';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
        title="Actualizar estado y datos de pago del detalle"
      >
        <Pencil className="h-2.5 w-2.5" />
        Actualizar
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Actualizar detalle"
        description={`${detalle.nombreCompleto} · ${detalle.numeroDocumento}`}
        size="md"
      >
        <form action={submit} className="space-y-4">
          <div>
            <label
              htmlFor={`estado-${detalle.id}`}
              className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
            >
              Estado
            </label>
            <select
              id={`estado-${detalle.id}`}
              name="estado"
              required
              defaultValue={detalle.estado === 'DEVUELTA' ? 'PENDIENTE' : detalle.estado}
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_PROCESO">En proceso</option>
              <option value="PAGADA">Pagada</option>
            </select>
          </div>

          <div>
            <label
              htmlFor={`fechaPago-${detalle.id}`}
              className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
            >
              Fecha de pago <span className="text-slate-400">(solo si Pagada)</span>
            </label>
            <input
              id={`fechaPago-${detalle.id}`}
              type="date"
              name="fechaPago"
              defaultValue={fechaPagoIso}
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor={`pagadoConEmpresaId-${detalle.id}`}
              className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
            >
              Pagado con empresa <span className="text-slate-400">(opcional)</span>
            </label>
            <select
              id={`pagadoConEmpresaId-${detalle.id}`}
              name="pagadoConEmpresaId"
              defaultValue={detalle.pagadoConEmpresaId ?? ''}
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">— No especificado —</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={`observaciones-${detalle.id}`}
              className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
            >
              Observaciones
            </label>
            <textarea
              id={`observaciones-${detalle.id}`}
              name="observaciones"
              rows={2}
              defaultValue={detalle.observaciones ?? ''}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          {state.error && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar cambios
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
