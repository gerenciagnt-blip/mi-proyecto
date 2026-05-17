'use client';

import { useTransition } from 'react';
import { Lock } from 'lucide-react';
import { cerrarComisionAction } from './actions';

export function CerrarComisionButton({
  asesorId,
  periodoId,
  disabled,
}: {
  asesorId: string;
  periodoId: string;
  disabled: boolean;
}) {
  const [pending, start] = useTransition();
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-400"
        title={
          'No se puede cerrar (revisa que el periodo esté cerrado y que el asesor genere comisión)'
        }
      >
        <Lock className="h-3 w-3" />
        Cerrar
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm('¿Cerrar la comisión de este asesor para el periodo? Es definitivo.')) return;
        start(async () => {
          const r = await cerrarComisionAction(asesorId, periodoId);
          if (r.error) alert(r.error);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md border border-brand-blue/30 bg-brand-blue/5 px-2 py-1 text-[11px] font-medium text-brand-blue transition hover:bg-brand-blue/10 disabled:opacity-50"
    >
      <Lock className="h-3 w-3" />
      {pending ? 'Cerrando…' : 'Cerrar'}
    </button>
  );
}
