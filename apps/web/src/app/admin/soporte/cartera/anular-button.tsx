'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { anularConsolidadoAction } from './actions';

export function AnularConsolidadoButton({
  consolidadoId,
  consecutivo,
}: {
  consolidadoId: string;
  consecutivo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAnular() {
    setError(null);
    startTransition(async () => {
      const r = await anularConsolidadoAction(consolidadoId);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.push('/admin/soporte/cartera');
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Anular
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Anular consolidado"
        description={`Vas a borrar ${consecutivo} con todas sus líneas y gestiones. Esta acción no se puede deshacer.`}
        size="sm"
      >
        {error && (
          <Alert variant="danger" className="mb-3">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleAnular} disabled={pending}>
            {pending ? 'Anulando…' : 'Sí, anular'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
