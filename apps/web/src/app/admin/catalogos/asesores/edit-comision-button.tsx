'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Pencil, X, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { updateAsesorComisionAction } from './actions';

type Props = {
  asesorId: string;
  asesorCodigo: string;
  asesorNombre: string;
  generaComision: boolean;
  metaMensual: number | null;
};

/**
 * Sprint Comisiones · UI — botón "Editar comisión" en cada fila de la
 * tabla de asesores. Abre un modal con toggle + input de meta. Llama a
 * `updateAsesorComisionAction` y refresca la página al guardar.
 */
export function EditComisionButton({
  asesorId,
  asesorCodigo,
  asesorNombre,
  generaComision: initGeneraComision,
  metaMensual: initMeta,
}: Props) {
  const [open, setOpen] = useState(false);
  const [generaComision, setGeneraComision] = useState(initGeneraComision);
  const [metaStr, setMetaStr] = useState<string>(
    initMeta != null ? String(Math.round(initMeta)) : '',
  );
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      setGeneraComision(initGeneraComision);
      setMetaStr(initMeta != null ? String(Math.round(initMeta)) : '');
      setErr(null);
    }
  }, [open, initGeneraComision, initMeta]);

  // Cerrar con Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function guardar() {
    setErr(null);
    if (generaComision) {
      const m = Number(metaStr.replace(/[\s,]/g, ''));
      if (!Number.isFinite(m) || m <= 0) {
        setErr('Si genera comisión, la meta debe ser > 0');
        return;
      }
    }
    const fd = new FormData();
    fd.set('id', asesorId);
    if (generaComision) fd.set('generaComision', 'on');
    fd.set('metaMensual', metaStr);
    start(async () => {
      const r = await updateAsesorComisionAction({}, fd);
      if (r.error) {
        setErr(r.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-blue"
        title="Editar comisión"
      >
        <Pencil className="h-3 w-3" />
        Comisión
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div>
                <h3 className="font-heading text-base font-semibold text-slate-900">
                  Editar comisión
                </h3>
                <p className="text-xs text-slate-500">
                  <span className="font-mono">{asesorCodigo}</span> · {asesorNombre}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-4 px-5 py-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={generaComision}
                  onChange={(e) => setGeneraComision(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="font-medium">Genera comisión</span>
              </label>

              {generaComision && (
                <div>
                  <Label htmlFor="meta-edit" className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    Meta mensual (COP)
                  </Label>
                  <Input
                    id="meta-edit"
                    type="number"
                    min="0"
                    step="1000"
                    value={metaStr}
                    onChange={(e) => setMetaStr(e.target.value)}
                    placeholder="1500000"
                    className="mt-1"
                    autoFocus
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Base sobre la que se aplican los % (10/20/30/40) según las 3 reglas + bono.
                  </p>
                </div>
              )}

              {!generaComision && (
                <Alert variant="info" className="text-xs">
                  Al desactivar, las afiliaciones que este asesor radique no generarán comisión. Los
                  snapshots anteriores en periodos cerrados quedan intactos.
                </Alert>
              )}

              {err && <Alert variant="danger">{err}</Alert>}
            </div>

            <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <Button onClick={guardar} disabled={pending}>
                {pending ? 'Guardando…' : 'Guardar'}
              </Button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
