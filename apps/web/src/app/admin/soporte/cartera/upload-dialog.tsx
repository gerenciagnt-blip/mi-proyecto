'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, CheckCircle2, AlertTriangle, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  previewCarteraAction,
  importarCarteraAction,
  type PreviewResult,
} from './actions';

function formatCOPLocal(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Botón que abre el dialog. Sólo visible para staff (layout ya lo protege). */
export function UploadCarteraButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="gradient" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        <span>Cargar estado de cuenta</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cargar estado de cuenta"
        description="Sube el PDF de la entidad SGSS. El sistema detecta el formato y muestra un preview antes de guardar."
        size="xl"
      >
        <UploadCarteraForm onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function UploadCarteraForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [errorImport, setErrorImport] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function handleFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setErrorImport(null);
    setSuccessMsg(null);
  }

  function runPreview() {
    if (!file) return;
    setErrorImport(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await previewCarteraAction(fd);
      setPreview(r);
    });
  }

  function runImport(reemplazar: boolean) {
    if (!file) return;
    setErrorImport(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append('file', file);
      if (reemplazar) fd.append('reemplazar', '1');
      const r = await importarCarteraAction({}, fd);
      if (r.error) {
        setErrorImport(r.error);
        return;
      }
      setSuccessMsg(r.mensaje ?? 'Importado correctamente');
      router.refresh();
      // Cerramos el dialog tras 1.5 s para que el staff vea el mensaje.
      setTimeout(() => onClose(), 1500);
    });
  }

  return (
    <div className="space-y-4">
      {/* File input */}
      <div>
        <label
          htmlFor="cartera-file"
          className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-brand-blue hover:bg-brand-blue/5"
        >
          <Upload className="h-6 w-6 text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-700">
            {file ? file.name : 'Haz click o arrastra el PDF aquí'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Máx 10 MB. Formatos soportados: Protección, Salud Total, S.O.S, SURA, Sanitas
          </p>
        </label>
        <input
          id="cartera-file"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {file && !preview && (
        <Button onClick={runPreview} disabled={pending}>
          {pending ? 'Parseando…' : 'Analizar PDF'}
        </Button>
      )}

      {/* Preview result */}
      {preview && !preview.ok && (
        <Alert variant="danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{preview.error}</p>
            {preview.preview && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-500">
                  Ver texto extraído (debug)
                </summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-100 p-2 text-[10px]">
                  {preview.preview}
                </pre>
              </details>
            )}
          </div>
        </Alert>
      )}

      {preview && preview.ok && (
        <div className="space-y-3">
          {/* Cabecera */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
            <Field label="Origen detectado" value={preview.cabecera.origenPdf} />
            <Field
              label="Entidad"
              value={`${preview.cabecera.entidadNombre} (${preview.cabecera.tipoEntidad})`}
            />
            <Field
              label="Empresa"
              value={`${preview.cabecera.empresaRazonSocial} · NIT ${preview.cabecera.empresaNit || '—'}`}
            />
            <Field
              label="Período"
              value={
                preview.cabecera.periodoDesde && preview.cabecera.periodoHasta
                  ? `${preview.cabecera.periodoDesde} → ${preview.cabecera.periodoHasta}`
                  : preview.cabecera.periodoHasta ?? '—'
              }
            />
            <Field
              label="Total informado"
              value={formatCOPLocal(preview.cabecera.valorTotalInformado)}
              highlight
            />
            <Field
              label="Suma del detallado"
              value={formatCOPLocal(preview.cabecera.sumaDetallado)}
            />
            <Field
              label="Cantidad de líneas"
              value={String(preview.cabecera.cantidadLineas)}
            />
            <Field
              label="Diferencia"
              value={formatCOPLocal(
                Math.abs(
                  preview.cabecera.valorTotalInformado -
                    preview.cabecera.sumaDetallado,
                ),
              )}
              tone={
                Math.abs(
                  preview.cabecera.valorTotalInformado -
                    preview.cabecera.sumaDetallado,
                ) > preview.cabecera.valorTotalInformado * 0.05
                  ? 'warning'
                  : 'ok'
              }
            />
          </div>

          {/* Advertencias */}
          {preview.advertencias.length > 0 && (
            <Alert variant="warning">
              <FileWarning className="h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {preview.advertencias.length} advertencia{preview.advertencias.length === 1 ? '' : 's'}
                </p>
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {preview.advertencias.slice(0, 5).map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}

          {/* Conflicto re-import */}
          {preview.conflicto && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Ya existe un consolidado equivalente</p>
                <p className="mt-1 text-xs">
                  {preview.conflicto.consecutivo} · {preview.conflicto.cantidadRegistros} líneas
                  · registrado el{' '}
                  {new Date(preview.conflicto.fechaRegistro).toLocaleDateString('es-CO')}.
                  Si confirmas, el consolidado anterior se reemplaza (las gestiones que tenía se pierden).
                </p>
              </div>
            </Alert>
          )}

          {/* Preview tabla */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="border-b border-slate-100 bg-slate-50 px-4 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Primeras {preview.previewLineas.length} líneas del detallado
              </h3>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5">Documento</th>
                    <th className="px-3 py-1.5">Nombre</th>
                    <th className="px-3 py-1.5">Período</th>
                    <th className="px-3 py-1.5 text-right">Valor</th>
                    <th className="px-3 py-1.5 text-right">IBC</th>
                    <th className="px-3 py-1.5">Novedad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.previewLineas.map((l, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono text-[10px]">
                        {l.tipoDocumento} {l.numeroDocumento}
                      </td>
                      <td className="px-3 py-1.5">{l.nombreCompleto}</td>
                      <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                        {l.periodoCobro}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {formatCOPLocal(l.valorCobro)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-500">
                        {l.ibc != null ? formatCOPLocal(l.ibc) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">
                        {l.novedad ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import result */}
          {errorImport && (
            <Alert variant="danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p>{errorImport}</p>
            </Alert>
          )}
          {successMsg && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <p>{successMsg}</p>
            </Alert>
          )}

          {/* Botones finales */}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button
              onClick={() => runImport(!!preview.conflicto)}
              disabled={pending || !!successMsg}
            >
              {pending
                ? 'Guardando…'
                : preview.conflicto
                  ? 'Reemplazar e importar'
                  : 'Confirmar e importar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: 'ok' | 'warning';
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 font-mono text-sm',
          highlight ? 'font-bold text-brand-blue-dark' : 'text-slate-900',
          tone === 'warning' && 'text-amber-700',
          tone === 'ok' && 'text-emerald-700',
        )}
      >
        {value}
      </p>
    </div>
  );
}
