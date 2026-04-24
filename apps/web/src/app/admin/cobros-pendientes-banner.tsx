'use client';

import { useState } from 'react';
import { AlertTriangle, DollarSign, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCOP } from '@/lib/format';

/**
 * Banner que muestra los cobros pendientes o vencidos de la sucursal del
 * aliado al entrar a /admin. Abre un modal con el desglose por cobro y
 * link al detalle completo.
 */

type CobroMini = {
  id: string;
  consecutivo: string;
  total: number;
  fechaLimite: Date;
  estado: 'PENDIENTE' | 'VENCIDO';
  periodoAnio: number;
  periodoMes: number;
};

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function CobrosPendientesBanner({
  cobros,
  bloqueadaPorMora,
}: {
  cobros: CobroMini[];
  bloqueadaPorMora: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  if (cobros.length === 0) return null;

  const total = cobros.reduce((s, c) => s + c.total, 0);
  const hayVencido = cobros.some((c) => c.estado === 'VENCIDO');

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left shadow-sm transition hover:shadow',
          hayVencido
            ? 'border-red-300 bg-red-50 hover:bg-red-100'
            : 'border-amber-300 bg-amber-50 hover:bg-amber-100',
        )}
      >
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            hayVencido ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
          )}
        >
          {hayVencido ? <AlertTriangle className="h-5 w-5" /> : <DollarSign className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <p
            className={cn('text-sm font-semibold', hayVencido ? 'text-red-900' : 'text-amber-900')}
          >
            {hayVencido
              ? `Tienes ${cobros.length} cobro${cobros.length > 1 ? 's' : ''} vencido${cobros.length > 1 ? 's' : ''}`
              : `Tienes ${cobros.length} cobro${cobros.length > 1 ? 's' : ''} pendiente${cobros.length > 1 ? 's' : ''}`}
          </p>
          <p className={cn('text-xs', hayVencido ? 'text-red-700' : 'text-amber-800')}>
            Total por pagar: <span className="font-mono font-semibold">{formatCOP(total)}</span>
            {bloqueadaPorMora && ' · Tu sucursal está bloqueada — regulariza para reactivar.'}
          </p>
        </div>
        <ChevronRight
          className={cn('h-4 w-4 shrink-0', hayVencido ? 'text-red-600' : 'text-amber-600')}
        />
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900">
                  <DollarSign className="h-5 w-5 text-brand-blue" />
                  Cobros pendientes
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Detalle de los cobros que debes al operador.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {bloqueadaPorMora && (
              <div className="border-b border-red-200 bg-red-50 px-6 py-3">
                <p className="flex items-start gap-2 text-xs text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>Tu sucursal está bloqueada por mora.</strong> El acceso a varias
                    funciones puede estar restringido hasta que regularices los pagos.
                  </span>
                </p>
              </div>
            )}

            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-2">Consecutivo</th>
                    <th className="px-6 py-2">Período</th>
                    <th className="px-6 py-2">Fecha límite</th>
                    <th className="px-6 py-2">Estado</th>
                    <th className="px-6 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cobros.map((c) => {
                    const vencido = c.estado === 'VENCIDO' || c.fechaLimite < new Date();
                    return (
                      <tr key={c.id}>
                        <td className="px-6 py-2.5 font-mono text-xs font-semibold text-brand-blue">
                          {c.consecutivo}
                        </td>
                        <td className="px-6 py-2.5 text-xs">
                          {MESES[c.periodoMes - 1]} {c.periodoAnio}
                        </td>
                        <td
                          className={cn(
                            'px-6 py-2.5 text-xs',
                            vencido && 'font-semibold text-red-700',
                          )}
                        >
                          {c.fechaLimite.toLocaleDateString('es-CO')}
                        </td>
                        <td className="px-6 py-2.5">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                              c.estado === 'VENCIDO'
                                ? 'bg-red-50 text-red-700 ring-red-200'
                                : 'bg-amber-50 text-amber-700 ring-amber-200',
                            )}
                          >
                            {c.estado === 'VENCIDO' ? 'Vencido' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="px-6 py-2.5 text-right font-mono text-sm font-semibold">
                          {formatCOP(c.total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-2 text-right text-xs font-medium uppercase tracking-wider text-slate-600"
                    >
                      Total a pagar
                    </td>
                    <td className="px-6 py-2 text-right font-mono text-base font-bold text-brand-blue-dark">
                      {formatCOP(cobros.reduce((s, c) => s + c.total, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <footer className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
