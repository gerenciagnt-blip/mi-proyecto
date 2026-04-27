'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { updateEntidadAction } from './actions';

/**
 * Input inline para editar `codigoAxa` desde la tabla.
 *
 * Estrategia: el ADMIN tipea, sale del input (blur) o presiona Enter,
 * y se dispara la server action. Si el valor no cambió, no hace nada.
 *
 * Mantiene los otros campos (nombre, codigoMinSalud, nit) intactos —
 * el server action recibe el FormData completo y los preserva.
 *
 * Solo se renderea para EPS/AFP (controlado por el caller).
 */
export function EditCodigoAxaRow({
  id,
  nombre,
  codigoMinSalud,
  nit,
  codigoAxaInicial,
}: {
  id: string;
  nombre: string;
  codigoMinSalud: string | null;
  nit: string | null;
  codigoAxaInicial: string | null;
}) {
  const [valor, setValor] = useState(codigoAxaInicial ?? '');
  const [feedback, setFeedback] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const guardar = () => {
    const limpio = valor.trim();
    if (limpio === (codigoAxaInicial ?? '')) {
      // Sin cambios — no llamar al server.
      return;
    }
    setFeedback('saving');
    setError(null);
    const fd = new FormData();
    fd.set('nombre', nombre);
    fd.set('codigoMinSalud', codigoMinSalud ?? '');
    fd.set('nit', nit ?? '');
    fd.set('codigoAxa', limpio);

    startTransition(async () => {
      const res = await updateEntidadAction(id, {}, fd);
      if (res.error) {
        setFeedback('error');
        setError(res.error);
      } else {
        setFeedback('saved');
        setTimeout(() => setFeedback('idle'), 1500);
      }
    });
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder="—"
        maxLength={10}
        className="h-7 w-20 rounded border border-slate-200 bg-white px-1.5 font-mono text-xs focus:border-brand-blue focus:outline-none"
      />
      {feedback === 'saving' || isPending ? (
        <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
      ) : feedback === 'saved' ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : feedback === 'error' && error ? (
        <span className="text-[10px] text-red-600" title={error}>
          ⚠
        </span>
      ) : null}
    </div>
  );
}
