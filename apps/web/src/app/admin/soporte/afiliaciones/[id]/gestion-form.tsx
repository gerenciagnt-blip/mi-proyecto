'use client';

import { useActionState, useState, useRef } from 'react';
import { Loader2, Paperclip, X, Check } from 'lucide-react';
import type { SoporteAfEstado } from '@pila/db';
import { gestionSoporteAfAction, type ActionState } from '../actions';

const ESTADO_LABEL: Record<SoporteAfEstado, string> = {
  EN_PROCESO: 'En proceso',
  PROCESADA: 'Procesada',
  RECHAZADA: 'Rechazada',
  NOVEDAD: 'Novedad',
};

export function GestionForm({
  soporteAfId,
  estadoActual,
}: {
  soporteAfId: string;
  estadoActual: SoporteAfEstado;
}) {
  const accion = gestionSoporteAfAction.bind(null, soporteAfId);
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    accion,
    {},
  );
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <form
      action={(fd) => {
        for (const f of files) fd.append('documento', f);
        submit(fd);
      }}
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Nuevo estado
          </span>
          <select
            name="nuevoEstado"
            defaultValue={estadoActual}
            className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
          >
            {(Object.keys(ESTADO_LABEL) as SoporteAfEstado[]).map((e) => (
              <option key={e} value={e}>
                {ESTADO_LABEL[e]}
                {e === estadoActual ? ' (actual)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Observación <span className="text-red-500">*</span>
        </span>
        <textarea
          name="descripcion"
          rows={3}
          required
          placeholder="Describe la gestión: qué validaste, qué pediste al aliado, por qué lo rechazas…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </label>

      <div className="space-y-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Adjuntar documentos (opcional)
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
          onChange={onFilesPicked}
          className="block text-xs file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        {files.length > 0 && (
          <ul className="space-y-1 text-xs">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
              >
                <Paperclip className="h-3 w-3 text-slate-400" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="font-mono text-[10px] text-slate-500">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-slate-400 hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <Check className="h-3 w-3" /> Gestión registrada
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Registrar gestión
      </button>
    </form>
  );
}
