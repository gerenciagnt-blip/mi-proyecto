'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { MessageSquare, X, Users, Inbox, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  listarConversacionesAction,
  crearConversacionAction,
  type ConversacionListItem,
} from './actions';
import { listarUsuariosOnlineAction, type UsuarioOnline } from './presencia-actions';
import { PanelConversacion } from './panel-conversacion';

// Sprint Chat · SSE — el push real llega por EventSource. Polling como
// fallback (30s) para resincronizar si la conexión SSE se cae.
const CONV_REFRESH_MS = 30_000;
// Presencia: 15s. No tiene SSE porque el bus solo cubre eventos de chat,
// no de heartbeat de otros users. Es razonable polear esto a 15s — el
// umbral de "online" del server es 2 min de todas formas.
const PRESENCIA_REFRESH_MS = 15_000;

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  SOPORTE: 'Soporte',
  ALIADO_OWNER: 'Dueño aliado',
  ALIADO_USER: 'Usuario aliado',
  ASESOR_COMERCIAL: 'Asesor comercial',
};

async function fetchConvs(): Promise<ConversacionListItem[]> {
  const r = await listarConversacionesAction();
  if (!r.ok) throw new Error(r.error);
  return r.items;
}

async function fetchOnline(): Promise<UsuarioOnline[]> {
  const r = await listarUsuariosOnlineAction();
  if (!r.ok) throw new Error(r.error);
  return r.items;
}

/**
 * Sprint Chat interno — widget flotante global.
 *
 * Render:
 *   - Botón fixed bottom-right SIEMPRE visible (icon + badge total no leídos).
 *   - Al click se abre un panel modal anclado a la esquina (mobile: full-screen).
 *   - Sidebar interna con dos tabs:
 *       Online   → usuarios elegibles ACTIVOS, click → DM (idempotente).
 *       Mis chats → conversaciones existentes ordenadas por actividad.
 *   - Panel derecho → conversación abierta (reusa PanelConversacion).
 *
 * Polling:
 *   - Conversaciones: 8s (también cuando el widget está cerrado, para
 *     mantener el badge global vivo).
 *   - Online: 15s, solo cuando el widget está abierto en tab Online.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'online' | 'chats'>('online');
  const [activa, setActiva] = useState<string | null>(null);

  // Lista de conversaciones: polling siempre activo (necesario para el
  // badge de no leídos del botón flotante). SWR dedupe — abrir el widget
  // no duplica el request.
  const { data: convs } = useSWR('chat:conversaciones', fetchConvs, {
    refreshInterval: CONV_REFRESH_MS,
    revalidateOnFocus: true,
  });

  const totalUnread = useMemo(
    () => (convs ?? []).reduce((sum, c) => sum + c.unreadCount, 0),
    [convs],
  );

  // Si la URL trae ?chatconv=<id> al cargar (deep-link), abrimos el widget
  // en esa conversación.
  useEffect(() => {
    const url = new URL(window.location.href);
    const conv = url.searchParams.get('chatconv');
    if (conv) {
      setOpen(true);
      setTab('chats');
      setActiva(conv);
    }
  }, []);

  return (
    <>
      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue text-white shadow-lg ring-1 ring-brand-blue-dark/20 transition hover:scale-105 hover:bg-brand-blue-dark',
          open && 'scale-95 opacity-90',
        )}
        aria-label={open ? 'Cerrar chat' : 'Abrir chat'}
      >
        <MessageSquare className="h-5 w-5" />
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white ring-2 ring-white">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Modal/panel flotante */}
      {open && (
        <ChatWidgetPanel
          tab={tab}
          setTab={setTab}
          activa={activa}
          setActiva={setActiva}
          onClose={() => setOpen(false)}
          convs={convs ?? []}
        />
      )}
    </>
  );
}

function ChatWidgetPanel({
  tab,
  setTab,
  activa,
  setActiva,
  onClose,
  convs,
}: {
  tab: 'online' | 'chats';
  setTab: (t: 'online' | 'chats') => void;
  activa: string | null;
  setActiva: (id: string | null) => void;
  onClose: () => void;
  convs: ConversacionListItem[];
}) {
  return (
    <div className="fixed bottom-20 right-5 z-40 flex h-[600px] max-h-[calc(100vh-7rem)] w-[760px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-slate-200">
      <header className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-brand-blue to-brand-blue-dark px-4 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4" />
          <span className="font-heading text-sm font-semibold">Chat interno</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 transition hover:bg-white/15"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar con tabs */}
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-slate-200">
          <div className="flex gap-0.5 border-b border-slate-200 bg-slate-50 p-1">
            <TabButton
              activo={tab === 'online'}
              onClick={() => setTab('online')}
              icon={<Users className="h-3 w-3" />}
              label="Online"
            />
            <TabButton
              activo={tab === 'chats'}
              onClick={() => setTab('chats')}
              icon={<Inbox className="h-3 w-3" />}
              label={`Mis chats${convs.length ? ` (${convs.length})` : ''}`}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {tab === 'online' ? (
              <TabOnline activa={activa} setActiva={setActiva} />
            ) : (
              <TabChats convs={convs} activa={activa} setActiva={setActiva} />
            )}
          </div>
        </aside>

        {/* Panel conversación */}
        <div className="flex-1 overflow-hidden">
          {activa ? (
            <PanelConversacion key={activa} conversacionId={activa} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-400">
              <MessagesSquare className="h-8 w-8 text-slate-300" />
              <p>
                {tab === 'online'
                  ? 'Selecciona un usuario online para iniciar la conversación'
                  : 'Selecciona una conversación de la lista'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  activo,
  onClick,
  icon,
  label,
}: {
  activo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition',
        activo
          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
          : 'text-slate-500 hover:text-slate-700',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ============ Tab: Online ============

function TabOnline({
  activa,
  setActiva,
}: {
  activa: string | null;
  setActiva: (id: string) => void;
}) {
  const { data, error, isLoading } = useSWR('chat:online', fetchOnline, {
    refreshInterval: PRESENCIA_REFRESH_MS,
    revalidateOnFocus: true,
  });
  const { mutate } = useSWRConfig();
  const [iniciando, startInicio] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function iniciarDM(userId: string) {
    setErr(null);
    startInicio(async () => {
      const r = await crearConversacionAction({
        tipo: 'DM',
        participantesIds: [userId],
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      void mutate('chat:conversaciones');
      setActiva(r.conversacionId);
    });
  }

  if (isLoading && !data) {
    return <p className="px-4 py-6 text-center text-xs text-slate-400">Cargando…</p>;
  }
  if (error) {
    return (
      <p className="px-4 py-6 text-center text-xs text-red-600">
        {error instanceof Error ? error.message : 'Error'}
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-xs text-slate-400">
        No hay usuarios online en este momento.
      </p>
    );
  }

  return (
    <>
      {err && (
        <p className="m-3 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
          {err}
        </p>
      )}
      {data.map((u) => (
        <button
          key={u.id}
          type="button"
          disabled={iniciando}
          onClick={() => iniciarDM(u.id)}
          className={cn(
            'flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50 disabled:opacity-60',
            activa === u.id && 'bg-brand-blue/5',
          )}
        >
          <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {u.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
            <span className="absolute -bottom-0.5 -right-0.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-900">{u.name}</p>
            <p className="truncate text-[10px] text-slate-500">
              {ROLE_LABEL[u.role] ?? u.role}
              {u.sucursalCodigo ? ` · ${u.sucursalCodigo}` : ''}
            </p>
          </div>
        </button>
      ))}
    </>
  );
}

// ============ Tab: Mis chats ============

function TabChats({
  convs,
  activa,
  setActiva,
}: {
  convs: ConversacionListItem[];
  activa: string | null;
  setActiva: (id: string) => void;
}) {
  if (convs.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-xs text-slate-400">
        Aún no tienes conversaciones. Abre la pestaña Online para iniciar una.
      </p>
    );
  }

  return (
    <>
      {convs.map((c) => {
        const sel = c.id === activa;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiva(c.id)}
            className={cn(
              'flex w-full flex-col gap-0.5 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50',
              sel && 'bg-brand-blue/5',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'truncate text-xs',
                  c.unreadCount > 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-700',
                )}
              >
                {c.tipo === 'GRUPO' && '👥 '}
                {c.titulo}
              </span>
              {c.unreadCount > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-blue px-1 text-[10px] font-semibold text-white">
                  {c.unreadCount > 99 ? '99+' : c.unreadCount}
                </span>
              )}
            </div>
            {c.ultimoMensajePreview && (
              <span className="truncate text-[11px] text-slate-500">{c.ultimoMensajePreview}</span>
            )}
          </button>
        );
      })}
    </>
  );
}
