'use client';

import { useState, useTransition } from 'react';
import { Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { generarPlanillasAction } from './actions';

export function GenerarPlanillasButton({
  periodoId,
  disabled,
}: {
  periodoId: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        disabled={disabled || pending}
        onClick={() => {
          setMsg(null);
          start(async () => {
            const res = await generarPlanillasAction(periodoId);
            if (res.error) setMsg({ ok: false, text: res.error });
            else if (res.mensaje) setMsg({ ok: true, text: res.mensaje });
          });
        }}
      >
        <Sparkles className="h-4 w-4" />
        {pending ? 'Generando…' : 'Generar planillas'}
      </Button>

      {msg && (
        <Alert variant={msg.ok ? 'success' : 'danger'} className="flex-1 min-w-[240px]">
          {msg.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{msg.text}</span>
        </Alert>
      )}
    </div>
  );
}
