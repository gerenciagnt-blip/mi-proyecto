'use client';

import { useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2, CheckCircle2, AlertTriangle, XCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  importarCotizantesAction,
  previewImportarCotizantesAction,
  type ImportarState,
  type PreviewState,
} from './actions';

/**
 * Form de importación masiva en 2 fases:
 *   1. Preview: parsea sin persistir, muestra válidas/inválidas y cuántas
 *      ya existen en BD.
 *   2. Confirmar: crea las nuevas en transacción.
 *
 * El usuario puede ajustar su archivo y re-subir cuantas veces quiera
 * antes de confirmar — el preview es no-destructivo.
 */
export function ImportarCotizantesForm() {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);

  const [previewState, previewSubmit, previewPending] = useActionState<PreviewState, FormData>(
    previewImportarCotizantesAction,
    {},
  );
  const [importarState, importarSubmit, importarPending] = useActionState<ImportarState, FormData>(
    importarCotizantesAction,
    {},
  );

  const previewFormRef = useRef<HTMLFormElement>(null);
  const importarFormRef = useRef<HTMLFormElement>(null);

  function handleArchivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    setArchivo(e.target.files?.[0] ?? null);
  }

  // Wrapper que dispara el preview manualmente cuando elige archivo.
  function handlePreview() {
    if (!archivo) return;
    const fd = new FormData();
    fd.append('archivo', archivo);
    previewSubmit(fd);
  }

  function handleConfirmar() {
    if (!archivo) return;
    const fd = new FormData();
    fd.append('archivo', archivo);
    importarSubmit(fd);
    // Tras un import exitoso, refrescamos para que /admin/base-datos
    // muestre los cotizantes nuevos.
    setTimeout(() => router.refresh(), 1000);
  }

  const preview = previewState.preview;
  const yaConfirmado = importarState.ok;

  return (
    <div className="space-y-4">
      {/* Selector + preview button */}
      <form
        ref={previewFormRef}
        onSubmit={(e) => {
          e.preventDefault();
          handlePreview();
        }}
        className="space-y-3"
      >
        <div>
          <input
            type="file"
            name="archivo"
            accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={handleArchivoChange}
            className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          {archivo && (
            <p className="mt-1 text-[11px] text-slate-500">
              <FileText className="inline h-3 w-3" /> {archivo.name} ·{' '}
              {(archivo.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>

        <Button
          type="submit"
          variant="outline"
          disabled={!archivo || previewPending || yaConfirmado}
        >
          {previewPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analizando…
            </>
          ) : (
            'Validar archivo'
          )}
        </Button>
      </form>

      {/* Error global */}
      {previewState.error && (
        <Alert variant="danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>{previewState.error}</p>
        </Alert>
      )}

      {/* Preview */}
      {preview && !yaConfirmado && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Válidas"
              value={preview.validas.length}
              tone={preview.validas.length > 0 ? 'success' : 'muted'}
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            />
            <Stat
              label="Con errores"
              value={preview.invalidas.length}
              tone={preview.invalidas.length > 0 ? 'danger' : 'muted'}
              icon={<XCircle className="h-3.5 w-3.5" />}
            />
            <Stat
              label="Ya existen"
              value={preview.yaExistentes}
              tone={preview.yaExistentes > 0 ? 'warning' : 'muted'}
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
            />
            <Stat
              label="A crear"
              value={Math.max(0, preview.validas.length - preview.yaExistentes)}
              tone="primary"
              icon={<Upload className="h-3.5 w-3.5" />}
            />
          </div>

          {/* Detalle de errores */}
          {preview.invalidas.length > 0 && (
            <details className="mt-3 text-[11px]">
              <summary className="cursor-pointer font-medium text-red-700">
                {preview.invalidas.length} fila{preview.invalidas.length === 1 ? '' : 's'} con
                errores — corrigelas en tu archivo y vuelve a subir
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded bg-white p-2 ring-1 ring-red-100">
                {preview.invalidas.slice(0, 50).map((inv, i) => (
                  <li key={i} className="text-slate-700">
                    <span className="font-mono text-slate-500">Fila {inv.fila}:</span>{' '}
                    <span className="text-red-700">{inv.errores.join('; ')}</span>
                  </li>
                ))}
                {preview.invalidas.length > 50 && (
                  <li className="italic text-slate-500">… y {preview.invalidas.length - 50} más</li>
                )}
              </ul>
            </details>
          )}

          {/* Columnas ignoradas */}
          {preview.columnasIgnoradas.length > 0 && (
            <p className="mt-2 text-[10px] text-slate-500">
              <strong>Columnas ignoradas (no se usaron):</strong>{' '}
              {preview.columnasIgnoradas.join(', ')}
            </p>
          )}

          {/* Confirmar */}
          {preview.validas.length > preview.yaExistentes && (
            <form
              ref={importarFormRef}
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmar();
              }}
              className="mt-4 flex justify-end"
            >
              <Button type="submit" disabled={importarPending}>
                {importarPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Importando…
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    Importar {preview.validas.length - preview.yaExistentes} cotizante
                    {preview.validas.length - preview.yaExistentes === 1 ? '' : 's'}
                  </>
                )}
              </Button>
            </form>
          )}
          {preview.validas.length > 0 && preview.validas.length === preview.yaExistentes && (
            <p className="mt-3 text-[11px] italic text-slate-500">
              Todas las filas válidas ya existen en BD — nada nuevo para crear.
            </p>
          )}
        </div>
      )}

      {/* Resultado final del import */}
      {importarState.error && (
        <Alert variant="danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>{importarState.error}</p>
        </Alert>
      )}
      {yaConfirmado && importarState.resultado && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <div className="text-xs">
            <p className="font-semibold">Importación completa</p>
            <ul className="mt-1 space-y-0.5">
              <li>
                Creados: <strong>{importarState.resultado.creados}</strong>
              </li>
              {importarState.resultado.omitidosPorYaExistir > 0 && (
                <li>
                  Omitidos (ya existían):{' '}
                  <strong>{importarState.resultado.omitidosPorYaExistir}</strong>
                </li>
              )}
              {importarState.resultado.erroresAlCrear > 0 && (
                <li className="text-red-700">
                  Errores: <strong>{importarState.resultado.erroresAlCrear}</strong>
                </li>
              )}
            </ul>
          </div>
        </Alert>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: 'success' | 'danger' | 'warning' | 'muted' | 'primary';
  icon: React.ReactNode;
}) {
  const toneClass = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    muted: 'border-slate-200 bg-white text-slate-500',
    primary: 'border-brand-blue/30 bg-brand-blue/5 text-brand-blue-dark',
  }[tone];

  return (
    <div className={`rounded-lg border p-2 ${toneClass}`}>
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <p className="mt-1 font-mono text-xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
