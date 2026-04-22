'use client';

import { useState, useTransition } from 'react';
import { Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { anularPlanillaAction } from './actions';

export function AnularPlanillaButton({ planillaId }: { planillaId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              'Al anular esta planilla sus comprobantes volverán al consolidado. ¿Continuar?',
            )
          ) {
            return;
          }
          setErr(null);
          start(async () => {
            const res = await anularPlanillaAction(planillaId);
            if (res.error) setErr(res.error);
          });
        }}
      >
        <Ban className="h-3.5 w-3.5" />
        {pending ? 'Anulando…' : 'Anular'}
      </Button>
      {err && (
        <span className="ml-2 text-xs text-red-700">{err}</span>
      )}
    </>
  );
}
