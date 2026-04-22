'use client';

import { useState, useEffect, useTransition } from 'react';
import { Save, AlertCircle, CheckCircle2, Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import {
  procesarTransaccionAction,
  listarMediosPagoAction,
  type PreviewInput,
  type ProcesarInput,
} from './actions';

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

type Props = {
  open: boolean;
  onClose: () => void;
  onProcesado: () => void;
  context: PreviewInput;
  totalGeneral: number;
};

export function PrefacturarDialog({
  open,
  onClose,
  onProcesado,
  context,
  totalGeneral,
}: Props) {
  const [formaPago, setFormaPago] = useState<ProcesarInput['formaPago']>(
    'POR_CONFIGURACION',
  );
  const [numero, setNumero] = useState('');
  const [fechaPago, setFechaPago] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [medioPagoId, setMedioPagoId] = useState('');
  const [medios, setMedios] = useState<Array<{ id: string; codigo: string; nombre: string }>>([]);
  const [loadingMedios, startLoad] = useTransition();

  const [procesando, startProcesar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<{ consecutivo: string; total: number } | null>(
    null,
  );

  // Cargar medios de pago al abrir
  useEffect(() => {
    if (!open) return;
    startLoad(async () => {
      const m = await listarMediosPagoAction();
      setMedios(m);
    });
  }, [open]);

  // Reset al abrir/cerrar
  useEffect(() => {
    if (!open) {
      setError(null);
      setExito(null);
    }
  }, [open]);

  const onSubmit = () => {
    setError(null);
    setExito(null);
    if (formaPago === 'POR_MEDIO_PAGO' && !medioPagoId) {
      setError('Selecciona un medio de pago');
      return;
    }
    startProcesar(async () => {
      const r = await procesarTransaccionAction({
        ...context,
        formaPago,
        numeroComprobanteExt: numero.trim() || undefined,
        fechaPago,
        medioPagoId: formaPago === 'POR_MEDIO_PAGO' ? medioPagoId : undefined,
      });
      if (r.error) {
        setError(r.error);
      } else if (r.ok && r.consecutivo) {
        setExito({ consecutivo: r.consecutivo, total: r.totalGeneral ?? 0 });
        setTimeout(() => {
          onProcesado();
        }, 1500);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Pre-facturar transacción"
      description="Completa los datos de pago antes de procesar."
      size="md"
    >
      {exito ? (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <div>
            <p>
              Transacción procesada · Comprobante{' '}
              <strong className="font-mono">{exito.consecutivo}</strong>
            </p>
            <p className="mt-0.5 text-xs">Total: {copFmt.format(exito.total)}</p>
          </div>
        </Alert>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Total a pre-facturar</p>
            <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-brand-blue-dark">
              {copFmt.format(totalGeneral)}
            </p>
          </div>

          <div>
            <Label htmlFor="formaPago">Forma de pago *</Label>
            <select
              id="formaPago"
              value={formaPago}
              onChange={(e) => setFormaPago(e.target.value as ProcesarInput['formaPago'])}
              required
              className="mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm"
            >
              <option value="POR_CONFIGURACION">Por configuración</option>
              <option value="CONSOLIDADO">Consolidado</option>
              <option value="POR_MEDIO_PAGO">Por medio de pago</option>
            </select>
          </div>

          {formaPago === 'POR_MEDIO_PAGO' && (
            <div>
              <Label htmlFor="medioPagoId">Medio de pago *</Label>
              <select
                id="medioPagoId"
                value={medioPagoId}
                onChange={(e) => setMedioPagoId(e.target.value)}
                required
                disabled={loadingMedios}
                className="mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm"
              >
                <option value="">— Seleccionar —</option>
                {medios.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.codigo} — {m.nombre}
                  </option>
                ))}
              </select>
              {loadingMedios && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Cargando medios de pago…
                </p>
              )}
              {!loadingMedios && medios.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-700">
                  No hay medios de pago en el catálogo. Agrégalos en{' '}
                  /admin/catalogos/medios-pago.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="numero">Número comprobante</Label>
              <Input
                id="numero"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Externo / opcional"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fechaPago">Fecha de pago *</Label>
              <Input
                id="fechaPago"
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                required
                className="mt-1"
              />
            </div>
          </div>

          {error && (
            <Alert variant="danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" disabled={procesando}>
              {procesando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Procesando…
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4" />
                  <Save className="h-4 w-4" />
                  Procesar
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
