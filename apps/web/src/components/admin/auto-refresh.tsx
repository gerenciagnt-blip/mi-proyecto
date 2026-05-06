'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Auto-refresh client-side para páginas server-rendered cuyos datos
 * deben mantenerse frescos sin que el usuario tenga que apretar F5.
 *
 * Cómo funciona:
 *   - Cada `intervalMs` dispara `router.refresh()` que invalida el
 *     server cache y rerenderea el server component padre. Como la
 *     page (ej. /admin/sistema) usa `dynamic = 'force-dynamic'`, el
 *     re-render ejecuta las queries de status y refleja datos vivos.
 *   - `useTransition` permite detectar cuándo termina el refresh
 *     (router.refresh es async). Mientras pending, el icono gira.
 *   - Pausa automáticamente cuando la pestaña no está visible — evita
 *     requests inútiles si el usuario dejó la página abierta y se fue.
 *   - Botón manual "Refrescar" para forzar update inmediato.
 *
 * Solo monta un timer + un listener de visibilitychange. Sin DOM
 * adicional más allá del badge "Hace Xs · ↻".
 */
export function AutoRefresh({
  intervalMs = 30000,
  label = 'Auto-actualiza cada 30s',
}: {
  intervalMs?: number;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRefresh, setLastRefresh] = useState(() => Date.now());
  // Tick para que el contador "Hace Xs" se actualice cada segundo
  // sin necesidad de refrescar el server.
  const [now, setNow] = useState(() => Date.now());

  // Tick visual cada 1s — barato, no toca server.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Refresh server cada `intervalMs`, con pause cuando tab oculto.
  useEffect(() => {
    let timer: number | null = null;

    const programar = () => {
      if (timer != null) window.clearInterval(timer);
      if (document.visibilityState !== 'visible') return;
      timer = window.setInterval(() => {
        startTransition(() => {
          router.refresh();
        });
      }, intervalMs);
    };

    programar();
    document.addEventListener('visibilitychange', programar);
    return () => {
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', programar);
    };
  }, [router, intervalMs]);

  // Cuando termina la transición (server respondió), marcar lastRefresh.
  useEffect(() => {
    if (!isPending) setLastRefresh(Date.now());
  }, [isPending]);

  const segs = Math.floor((now - lastRefresh) / 1000);
  const haceTxt = segs < 60 ? `Hace ${segs}s` : `Hace ${Math.floor(segs / 60)} min`;

  const onManual = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="inline-flex items-center gap-2 text-[11px] text-slate-500">
      <span className="hidden sm:inline">{label}</span>
      <span
        className="font-mono text-slate-600"
        title={`Última actualización: ${new Date(lastRefresh).toLocaleTimeString('es-CO')}`}
      >
        {isPending ? 'Actualizando…' : haceTxt}
      </span>
      <button
        type="button"
        onClick={onManual}
        disabled={isPending}
        title="Refrescar ahora"
        aria-label="Refrescar ahora"
        className={cn(
          'rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50',
        )}
      >
        <RefreshCw className={cn('h-3 w-3', isPending && 'animate-spin')} />
      </button>
    </div>
  );
}
