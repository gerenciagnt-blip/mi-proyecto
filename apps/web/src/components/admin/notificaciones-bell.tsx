'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type NotifItem = {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  href: string | null;
  createdAt: string;
  leida: boolean;
};

const POLL_MS = 60_000; // 1 minuto

/**
 * Campana de notificaciones.
 *
 * - Polea `/api/notificaciones/count` cada 60s para mantener el badge.
 * - Al abrir el dropdown, fetch a `/api/notificaciones` con la lista.
 * - Click en una notificación → marca leída + navega al `href`.
 * - Botón "Marcar todas como leídas" para limpiar el badge de un golpe.
 */
export function NotificacionesBell() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Polling del conteo.
  useEffect(() => {
    let alive = true;
    const fetchCount = async () => {
      try {
        const r = await fetch('/api/notificaciones/count', { cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as { count: number };
        if (alive) setCount(j.count ?? 0);
      } catch {
        // ignore
      }
    };
    fetchCount();
    const t = setInterval(fetchCount, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Cierra al hacer click fuera.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const cargarLista = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/notificaciones', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { items: NotifItem[]; count: number };
      setItems(j.items);
      setCount(j.count);
    } finally {
      setLoading(false);
    }
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) cargarLista();
  }

  async function onItemClick(n: NotifItem) {
    setOpen(false);
    if (!n.leida) {
      // Marca leída en background (no esperamos)
      void fetch(`/api/notificaciones/${n.id}/leer`, { method: 'POST' }).then(() =>
        setCount((c) => Math.max(0, c - 1)),
      );
    }
    if (n.href) router.push(n.href);
  }

  async function marcarTodas() {
    const r = await fetch('/api/notificaciones/leer-todas', { method: 'POST' });
    if (r.ok) {
      setCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, leida: true })));
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={toggleOpen}
        title="Notificaciones"
        aria-label="Notificaciones"
        className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span
            className="absolute right-1 top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white"
            style={{ height: 16 }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Centro de notificaciones"
          className="absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-900">Notificaciones</p>
            {count > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                className="inline-flex items-center gap-1 text-[11px] text-brand-blue hover:underline"
                title="Marcar todas como leídas"
              >
                <CheckCheck className="h-3 w-3" />
                Marcar todas
              </button>
            )}
          </header>

          <div className="max-h-[420px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Cargando…
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-500">Sin notificaciones.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onItemClick(n)}
                      className={cn(
                        'block w-full px-4 py-2.5 text-left transition hover:bg-slate-50',
                        !n.leida && 'bg-brand-blue/5',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            'mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                            !n.leida ? 'bg-brand-blue' : 'bg-transparent',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'text-xs',
                              !n.leida ? 'font-semibold text-slate-900' : 'text-slate-700',
                            )}
                          >
                            {n.titulo}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                            {n.mensaje}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {formatRelative(n.createdAt)}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "hace 5 min", "hace 2 h", "ayer", o fecha completa. */
function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
