'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog } from '@/components/ui/dialog';
import { hoyIso } from '@/lib/format';
import { marcarPlanillaPagadaAction } from './actions';

export function MarcarPagadaDialog({
  planillaId,
  consecutivo,
}: {
  planillaId: string;
  consecutivo: string;
}) {
  const [open, setOpen] = useState(false);
  const [numeroExt, setNumeroExt] = useState('');
  const [fechaPago, setFechaPago] = useState(hoyIso());
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => {
          setErr(null);
          setNumeroExt('');
          setFechaPago(hoyIso());
          setOpen(true);
        }}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Marcar pagada
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Marcar planilla ${consecutivo} como pagada`}
        description="Confirma el número oficial que asignó el operador PILA y la fecha de pago. Una vez pagada la planilla no se puede anular."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="numeroExt">Número de planilla del operador *</Label>
            <Input
              id="numeroExt"
              value={numeroExt}
              onChange={(e) => setNumeroExt(e.target.value.trim())}
              placeholder="1234567890"
              className="mt-1"
              autoFocus
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Se propagará a todos los comprobantes de esta planilla.
            </p>
          </div>

          <div>
            <Label htmlFor="fechaPago">Fecha de pago *</Label>
            <Input
              id="fechaPago"
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              className="mt-1"
            />
          </div>

          {err && (
            <Alert variant="danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{err}</span>
            </Alert>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending || !numeroExt || !fechaPago}
              onClick={() => {
                setErr(null);
                start(async () => {
                  const res = await marcarPlanillaPagadaAction(
                    planillaId,
                    numeroExt,
                    fechaPago,
                  );
                  if (res.error) {
                    setErr(res.error);
                  } else {
                    setOpen(false);
                  }
                });
              }}
            >
              {pending ? 'Guardando…' : 'Confirmar pago'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
