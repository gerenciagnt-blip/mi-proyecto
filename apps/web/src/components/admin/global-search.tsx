'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type ResultItem = {
  id: string;
  titulo: string;
  subtitulo: string;
  href: string;
};
type ResultGroup = {
  tipo: string;
  label: string;
  items: ResultItem[];
};

const DEBOUNCE_MS = 200;

/**
 * Buscador global del admin. Atajos:
 *   - Ctrl+K (Win/Linux) / Cmd+K (Mac): abre el modal.
 *   - Esc: cierra.
 *   - ↑ ↓: navega los resultados.
 *   - Enter: abre el resultado seleccionado.
 *
 * El input tiene un debounce de 200ms para no martillar el endpoint en cada
 * tecla. Solo dispara la búsqueda si hay 2+ caracteres.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<ResultGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Lista plana de items para navegación por teclado.
  const flatItems = groups.flatMap((g) => g.items.map((it) => ({ ...it, groupLabel: g.label })));

  // Atajo global Ctrl/Cmd+K para abrir el modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const meta = isMac ? e.metaKey : e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus al input al abrir.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Limpia al cerrar para que la próxima apertura sea fresh.
      setQ('');
      setGroups([]);
      setActiveIdx(0);
    }
  }, [open]);

  // Debounce de la búsqueda.
  useEffect(() => {
    if (!open) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setGroups([]);
      return;
    }
    let abort = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/buscar?q=${encodeURIComponent(trimmed)}`, {
          cache: 'no-store',
        });
        if (!r.ok) return;
        const j = (await r.json()) as { groups: ResultGroup[] };
        if (!abort) {
          setGroups(j.groups);
          setActiveIdx(0);
        }
      } finally {
        if (!abort) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      abort = true;
      clearTimeout(t);
    };
  }, [q, open]);

  // Click fuera cierra.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const navigateTo = useCallback(
    (item: ResultItem) => {
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = flatItems[activeIdx];
      if (sel) navigateTo(sel);
    }
  }

  // Mostrar atajo apropiado según OS (best-effort, solo cosmético).
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const shortcut = isMac ? '⌘K' : 'Ctrl+K';

  return (
    <>
      {/* Trigger button — visible en el TopBar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Buscar (${shortcut})`}
        aria-label="Buscar"
        className="hidden h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-700 sm:inline-flex"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Buscar…</span>
        <kbd className="ml-2 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
          {shortcut}
        </kbd>
      </button>
      {/* Versión compacta para mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Buscar"
        aria-label="Buscar"
        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 sm:hidden"
      >
        <Search className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Búsqueda global"
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-[10vh]"
        >
          <div
            ref={dialogRef}
            className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          >
            {/* Input */}
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Buscar por NIT, cédula, consecutivo, nombre…"
                className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Resultados */}
            <div className="max-h-[60vh] overflow-y-auto">
              {q.trim().length < 2 ? (
                <div className="px-6 py-12 text-center text-xs text-slate-500">
                  <p>Escribe al menos 2 caracteres para buscar.</p>
                  <p className="mt-2 text-[10px] text-slate-400">
                    Cotizantes · Empresas · Empresa CC · Comprobantes · Planillas · Cartera ·
                    Incapacidades · Asesores
                  </p>
                </div>
              ) : groups.length === 0 && !loading ? (
                <div className="px-6 py-12 text-center text-xs text-slate-500">
                  Sin resultados para <strong>&ldquo;{q.trim()}&rdquo;</strong>.
                </div>
              ) : (
                <div className="py-1">
                  {groups.map((g) => (
                    <div key={g.tipo}>
                      <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {g.label}
                      </p>
                      <ul>
                        {g.items.map((item) => {
                          const flatIdx = flatItems.findIndex(
                            (f) => f.id === item.id && f.groupLabel === g.label,
                          );
                          const isActive = flatIdx === activeIdx;
                          return (
                            <li key={`${g.tipo}-${item.id}`}>
                              <button
                                type="button"
                                onClick={() => navigateTo(item)}
                                onMouseEnter={() => setActiveIdx(flatIdx)}
                                className={cn(
                                  'flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition',
                                  isActive ? 'bg-brand-blue/5' : 'hover:bg-slate-50',
                                )}
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-900">
                                    {item.titulo}
                                  </p>
                                  <p className="truncate text-[11px] text-slate-500">
                                    {item.subtitulo}
                                  </p>
                                </div>
                                <ArrowRight
                                  className={cn(
                                    'h-3.5 w-3.5 shrink-0 transition',
                                    isActive ? 'text-brand-blue' : 'text-slate-300',
                                  )}
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer con shortcuts */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">
              <div className="flex gap-3">
                <span>
                  <kbd className="rounded border border-slate-300 bg-white px-1 py-0.5 font-mono">
                    ↑↓
                  </kbd>{' '}
                  Navegar
                </span>
                <span>
                  <kbd className="rounded border border-slate-300 bg-white px-1 py-0.5 font-mono">
                    ↵
                  </kbd>{' '}
                  Abrir
                </span>
                <span>
                  <kbd className="rounded border border-slate-300 bg-white px-1 py-0.5 font-mono">
                    Esc
                  </kbd>{' '}
                  Cerrar
                </span>
              </div>
              {flatItems.length > 0 && <span>{flatItems.length} resultados</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
