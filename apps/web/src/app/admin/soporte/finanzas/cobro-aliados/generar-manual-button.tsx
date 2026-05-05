'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { generarCobroManualAction, type ActionState } from './actions';

/**
 * Botón "Generar cobro manual" — abre dialog con form para crear un
 * CobroAliado para una sucursal × período fuera del cron mensual.
 *
 * Útil cuando:
 *   - El cron del último día del mes falló y nadie generó el cobro.
 *   - Se ingresan afiliaciones/mensualidades tarde y hay que regenerar.
 *
 * Si ya existe cobro PENDIENTE/VENCIDO para esa combinación, hay un
 * checkbox "regenerar" que lo anula y crea uno nuevo. La action se
 * encarga de la lógica.
 */
export function GenerarManualButton({
  sucursales,
  periodos,
}: {
  sucursales: Array<{ id: string; codigo: string; nombre: string }>;
  periodos: Array<{ id: string; anio: number; mes: number }>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    generarCobroManualAction,
    {},
  );

  // Side-effect tras success: refrescar y cerrar dialog. Va en useEffect
  // (no inline en render) para no llamar setState durante renderizado.
  useEffect(() => {
    if (state.ok && open) {
      router.refresh();
      setOpen(false);
    }
  }, [state.ok, open, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 shadow-sm hover:bg-blue-100"
        title="Generar cobro manual para una sucursal × período"
      >
        <Plus className="h-3.5 w-3.5" />
        Generar manual
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Generar cobro manual"
        description="Útil si el cron del cierre de mes falló o se ingresaron datos tarde"
        size="md"
      >
        <form action={submit} className="space-y-4">
          <div>
            <label
              htmlFor="sucursalId"
              className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
            >
              Sucursal
            </label>
            <select
              id="sucursalId"
              name="sucursalId"
              required
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">— Seleccionar —</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} · {s.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="periodoId"
              className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
            >
              Período contable
            </label>
            <select
              id="periodoId"
              name="periodoId"
              required
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">— Seleccionar —</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {meses[p.mes - 1]} {p.anio}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input type="checkbox" name="regenerar" className="mt-0.5" />
            <span>
              <strong>Regenerar</strong> — si ya hay un cobro PENDIENTE/VENCIDO para esta
              combinación, anularlo y crear uno nuevo con los datos actuales.
            </span>
          </label>

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
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? 'Generando…' : 'Generar cobro'}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
