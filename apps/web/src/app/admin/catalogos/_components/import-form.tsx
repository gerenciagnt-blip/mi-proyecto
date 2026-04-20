'use client';

import { useActionState, useRef } from 'react';

export type ImportState = {
  error?: string;
  total?: number;
  added?: number;
  updated?: number;
  skipped?: number;
  errors?: string[];
};

export function ImportForm({
  action,
  headers,
  example,
}: {
  action: (prev: ImportState, formData: FormData) => Promise<ImportState>;
  headers: string[];
  example?: string;
}) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);

  const done =
    typeof state.total === 'number' ||
    (state.errors && state.errors.length > 0) ||
    !!state.error;

  return (
    <form ref={ref} action={formAction} className="space-y-3">
      <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Columnas esperadas:</p>
        <p className="mt-1 font-mono">{headers.join(' | ')}</p>
        {example && <p className="mt-1">Ejemplo: {example}</p>}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="file"
          name="file"
          required
          accept=".xlsx,.xls,.csv"
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-60"
        >
          {pending ? 'Importando…' : 'Importar'}
        </button>
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      {done && typeof state.total === 'number' && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Importación: <strong>{state.total}</strong> filas — {state.added} nuevas,{' '}
          {state.updated} actualizadas, {state.skipped} omitidas.
        </div>
      )}
      {state.errors && state.errors.length > 0 && (
        <details className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <summary className="cursor-pointer font-medium">
            {state.errors.length} filas con error
          </summary>
          <ul className="mt-2 max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-xs">
            {state.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </details>
      )}
    </form>
  );
}
