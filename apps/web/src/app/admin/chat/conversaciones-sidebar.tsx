'use client';

import useSWR from 'swr';
import { cn } from '@/lib/utils';
import { listarConversacionesAction, type ConversacionListItem } from './actions';

// Polling de 4s: el badge de no leídos debe reaccionar rápido en la
// barra lateral. 4s es ~2x el polling de mensajes — la consistencia
// eventual entre "lista" y "panel" no se nota en uso normal.
const REFRESH_INTERVAL_MS = 4_000;

async function fetchConvs(): Promise<ConversacionListItem[]> {
  const r = await listarConversacionesAction();
  if (!r.ok) throw new Error(r.error);
  return r.items;
}

function relativo(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const dias = Math.floor(hr / 24);
  if (dias < 7) return `${dias}d`;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
}

/**
 * Sprint Chat interno — sidebar con la lista de conversaciones del user.
 * Polling con SWR cada 12s. Click para seleccionar; badge cuenta no leídos.
 */
export function ConversacionesSidebar({
  activaId,
  onSelect,
}: {
  activaId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data, error, isLoading } = useSWR('chat:conversaciones', fetchConvs, {
    refreshInterval: REFRESH_INTERVAL_MS,
    revalidateOnFocus: true,
  });

  return (
    <aside className="flex w-[300px] shrink-0 flex-col">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        Conversaciones
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && !data && (
          <div className="px-4 py-6 text-center text-xs text-slate-400">Cargando…</div>
        )}
        {error && (
          <div className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error instanceof Error ? error.message : 'Error al cargar'}
          </div>
        )}
        {data && data.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-slate-400">
            Aún no tienes conversaciones. Inicia una desde &quot;Nuevo chat&quot;.
          </div>
        )}
        {data?.map((c) => {
          const activa = c.id === activaId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                'flex w-full flex-col gap-0.5 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50',
                activa && 'bg-brand-blue/5',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'truncate text-sm',
                    c.unreadCount > 0
                      ? 'font-semibold text-slate-900'
                      : 'font-medium text-slate-700',
                  )}
                  title={c.titulo}
                >
                  {c.tipo === 'GRUPO' && '🧑‍🤝‍🧑 '}
                  {c.titulo}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {relativo(c.ultimoMensajeAt)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">
                  {c.ultimoMensajePreview ? (
                    <>
                      <span className="text-slate-400">
                        {c.ultimoMensajeAutorNombre?.split(' ')[0] ?? ''}:
                      </span>{' '}
                      {c.ultimoMensajePreview}
                    </>
                  ) : (
                    <span className="italic text-slate-400">Sin mensajes</span>
                  )}
                </span>
                {c.unreadCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-blue px-1.5 text-[10px] font-semibold text-white">
                    {c.unreadCount > 99 ? '99+' : c.unreadCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
