'use client';

import { useTransition, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { conciliarMovimientoAction } from './actions';

export function ConciliarButton({ movimientoId }: { movimientoId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    setErr(null);
    start(async () => {
      const res = await conciliarMovimientoAction(movimientoId);
      if (res.error) setErr(res.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3 w-3" />
        )}
        Conciliar
      </button>
      {err && <span className="text-[11px] text-red-700">{err}</span>}
    </>
  );
}
