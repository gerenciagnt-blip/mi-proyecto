'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

type ResultadoApi = {
  kind:
    | 'NADA_QUE_PROCESAR'
    | 'LOCAL_SPAWNED'
    | 'GH_DISPATCHED'
    | 'CONFIG_FALTANTE'
    | 'GH_API_ERROR'
    | 'NETWORK_ERROR'
    | 'SPAWN_ERROR';
  message: string;
  pending?: number;
};

/**
 * Botón "Procesar pendientes ahora". Llama al endpoint que dispara el
 * bot (local en dev, GitHub Actions en producción).
 *
 * Tras éxito refresca la página automáticamente con un retraso para
 * que el usuario vea el feedback. Refresh adicional sigue siendo
 * manual (los jobs locales tardan 30-60s en avanzar de PENDING a
 * RUNNING/SUCCESS).
 */
export function ProcesarAhoraButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [estado, setEstado] = useState<{ kind: 'idle' } | { kind: 'ok' | 'error'; texto: string }>({
    kind: 'idle',
  });

  const onClick = () => {
    setEstado({ kind: 'idle' });
    startTransition(async () => {
      try {
        const res = await fetch('/api/colpatria/procesar-ahora', { method: 'POST' });
        const data = (await res.json()) as ResultadoApi;
        const ok = res.status === 200 || res.status === 202;
        setEstado({ kind: ok ? 'ok' : 'error', texto: data.message });
        if (ok && data.kind !== 'NADA_QUE_PROCESAR') {
          // Refresca después de 2s para que el usuario lea el mensaje
          setTimeout(() => router.refresh(), 2000);
        }
        // Auto-clear feedback en 8s para no bloquear UI
        setTimeout(() => setEstado({ kind: 'idle' }), 8000);
      } catch (err) {
        setEstado({
          kind: 'error',
          texto: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-brand-blue bg-brand-blue px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Disparando…
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5" />
            Procesar pendientes
          </>
        )}
      </button>

      {estado.kind === 'ok' && (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          {estado.texto}
        </span>
      )}
      {estado.kind === 'error' && (
        <span className="inline-flex max-w-md items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-[10px] text-rose-700 ring-1 ring-inset ring-rose-200">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{estado.texto}</span>
        </span>
      )}
    </div>
  );
}
