'use client';

import { useState, useTransition } from 'react';
import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { liquidarPeriodoAction } from './actions';

export function LiquidarButton({
  periodoId,
  disabled,
}: {
  periodoId: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  const onClick = () =>
    start(async () => {
      setMensaje(null);
      const r = await liquidarPeriodoAction(periodoId);
      setMensaje(r.mensaje ?? r.error ?? null);
      if (r.mensaje) {
        setTimeout(() => setMensaje(null), 4000);
      }
    });

  return (
    <div className="flex items-center gap-3">
      {mensaje && (
        <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
          {mensaje}
        </span>
      )}
      <Button
        type="button"
        variant="secondary"
        onClick={onClick}
        disabled={pending || disabled}
      >
        <Calculator className={pending ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
        {pending ? 'Liquidando…' : 'Liquidar período'}
      </Button>
    </div>
  );
}
