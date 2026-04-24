'use client';

import { useActionState, useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { importarExtractoAction, type ActionState } from './actions';

export function UploadExtractoForm() {
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    importarExtractoAction,
    {},
  );
  const [fileName, setFileName] = useState<string>('');

  return (
    <form action={submit} className="space-y-3">
      <div>
        <label
          htmlFor="archivo"
          className="text-[10px] font-medium uppercase tracking-wider text-slate-500"
        >
          Archivo (Excel o CSV)
        </label>
        <input
          id="archivo"
          name="archivo"
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        {fileName && <p className="mt-1 text-[11px] text-slate-500">{fileName}</p>}
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

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {pending ? 'Procesando…' : 'Importar extracto'}
      </button>
    </form>
  );
}
