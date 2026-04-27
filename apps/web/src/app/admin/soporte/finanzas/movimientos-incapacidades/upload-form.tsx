'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2, CheckCircle2, AlertTriangle, Info, FileUp } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { importarExtractoAction, type ActionState } from './actions';

/**
 * Sprint Soporte reorg — Convertimos el form que estaba pegado en la
 * página en un modal con su propio botón disparador, alineado visualmente
 * al "Registro manual". El usuario abre el modal, sube el extracto, ve
 * el resumen y cierra cuando termina.
 *
 * Nota Q5 (asignación empresa): NO se selecciona empresa al importar.
 * Los movimientos se crean sin empresa y luego se asignan inline en
 * cada fila de la tabla (modelo "B" elegido en el sprint).
 */
export function UploadExtractoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-blue bg-brand-blue px-3 text-xs font-medium text-white shadow-sm transition hover:bg-brand-blue-dark"
      >
        <FileUp className="h-3.5 w-3.5" />
        Importar extracto
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Importar extracto bancario"
        description="Sube un archivo Excel, CSV o PDF con los movimientos del banco. Los duplicados se descartan automáticamente."
        size="md"
      >
        <UploadForm onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function UploadForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    importarExtractoAction,
    {},
  );
  const [fileName, setFileName] = useState<string>('');

  // Auto-refresh cuando termina OK con creados > 0 (la lista necesita
  // mostrar las nuevas filas). Si fueron 0 creados (todos duplicados),
  // tampoco hace daño refrescar.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={submit} className="space-y-4">
      <div>
        <label
          htmlFor="archivo"
          className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
        >
          Archivo (Excel, CSV o PDF) <span className="text-red-500">*</span>
        </label>
        <input
          id="archivo"
          name="archivo"
          type="file"
          accept=".xlsx,.xls,.csv,.pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/pdf"
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        {fileName && <p className="mt-1 text-[11px] text-slate-500">{fileName}</p>}
        <p className="mt-1 text-[10px] text-slate-400">
          PDF: detecta líneas con patrón &ldquo;fecha … valor&rdquo;. Si tu extracto no es estándar,
          usa <strong>Registro manual</strong>.
        </p>
      </div>

      <div>
        <label
          htmlFor="bancoDefault"
          className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
        >
          Banco (opcional — se usa si el archivo no tiene columna banco)
        </label>
        <input
          id="bancoDefault"
          name="bancoDefault"
          placeholder="Bancolombia, Davivienda, BBVA…"
          className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
      </div>

      <p className="rounded-md bg-sky-50 px-3 py-2 text-[10px] text-sky-800">
        <Info className="mr-1 inline h-3 w-3" />
        Los movimientos importados llegan sin empresa planilla — la asignas después en la tabla,
        fila por fila.
      </p>

      {state.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          <p className="flex items-start gap-1 font-medium">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {state.error}
          </p>
          {state.importSummary?.errores && state.importSummary.errores.length > 0 && (
            <details className="mt-1 text-[10px]">
              <summary className="cursor-pointer">
                Ver {state.importSummary.errores.length} errores por fila
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4">
                {state.importSummary.errores.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {state.importSummary.errores.length > 10 && (
                  <li>… y {state.importSummary.errores.length - 10} más</li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}

      {state.ok && state.importSummary && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <p className="flex items-start gap-1 font-medium">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
            Import terminado
          </p>
          <ul className="mt-1 space-y-0.5 pl-4 text-[11px]">
            <li>
              Leídos: <strong>{state.importSummary.leidos}</strong>
            </li>
            <li>
              Creados: <strong>{state.importSummary.creados}</strong>
            </li>
            <li>Duplicados (ya existían): {state.importSummary.duplicados}</li>
            {state.importSummary.errores.length > 0 && (
              <li>Con errores: {state.importSummary.errores.length}</li>
            )}
          </ul>
          <details className="mt-1 text-[10px]">
            <summary className="cursor-pointer text-emerald-700">
              <Info className="inline h-3 w-3" /> Columnas detectadas
            </summary>
            <ul className="mt-1 pl-4">
              <li>
                Fecha: <code>{state.importSummary.columnasDetectadas.fecha ?? '—'}</code>
              </li>
              <li>
                Concepto: <code>{state.importSummary.columnasDetectadas.concepto ?? '—'}</code>
              </li>
              <li>
                Valor: <code>{state.importSummary.columnasDetectadas.valor ?? '—'}</code>
              </li>
              <li>
                Banco: <code>{state.importSummary.columnasDetectadas.banco ?? '—'}</code>
              </li>
            </ul>
          </details>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {state.ok ? 'Cerrar' : 'Cancelar'}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {pending ? 'Procesando…' : 'Importar'}
        </button>
      </div>
    </form>
  );
}
