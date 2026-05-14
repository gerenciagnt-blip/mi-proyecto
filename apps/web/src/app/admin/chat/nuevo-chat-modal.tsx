'use client';

import { useEffect, useState, useTransition } from 'react';
import { useSWRConfig } from 'swr';
import { Plus, Search, X, Users2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buscarUsuariosElegiblesAction,
  crearConversacionAction,
  type UsuarioElegible,
} from './actions';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  SOPORTE: 'Soporte',
  ALIADO_OWNER: 'Dueño aliado',
  ALIADO_USER: 'Usuario aliado',
  ASESOR_COMERCIAL: 'Asesor comercial',
};

/**
 * Sprint Chat interno — botón + modal para iniciar una conversación.
 *
 * Dos modos:
 *   - DM: seleccionas un usuario y se abre conversación 1:1 (idempotente:
 *     reutiliza la existente si ya hay).
 *   - GRUPO: nombre obligatorio + selección múltiple.
 *
 * El buscador filtra por nombre/email contra el set elegible para el rol
 * actual (server-side).
 */
export function NuevoChatButton({ onCreado }: { onCreado: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-brand-blue-dark"
      >
        <Plus className="h-3.5 w-3.5" />
        Nuevo chat
      </button>
      {open && (
        <NuevoChatModal
          onClose={() => setOpen(false)}
          onCreado={(id) => {
            setOpen(false);
            onCreado(id);
          }}
        />
      )}
    </>
  );
}

function NuevoChatModal({
  onClose,
  onCreado,
}: {
  onClose: () => void;
  onCreado: (id: string) => void;
}) {
  const [tipo, setTipo] = useState<'DM' | 'GRUPO'>('DM');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<UsuarioElegible[]>([]);
  const [seleccion, setSeleccion] = useState<UsuarioElegible[]>([]);
  const [nombreGrupo, setNombreGrupo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [creando, startCreate] = useTransition();
  const { mutate } = useSWRConfig();

  // Debounced search (300ms)
  useEffect(() => {
    const handle = setTimeout(() => {
      void buscarUsuariosElegiblesAction(q).then((r) => {
        if (r.ok) setItems(r.items);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [q]);

  function toggleUser(u: UsuarioElegible) {
    if (tipo === 'DM') {
      setSeleccion([u]);
      return;
    }
    setSeleccion((sel) =>
      sel.some((s) => s.id === u.id) ? sel.filter((s) => s.id !== u.id) : [...sel, u],
    );
  }

  function quitar(id: string) {
    setSeleccion((sel) => sel.filter((s) => s.id !== id));
  }

  function crear() {
    setErr(null);
    if (seleccion.length === 0) {
      setErr('Selecciona al menos un usuario');
      return;
    }
    if (tipo === 'GRUPO' && !nombreGrupo.trim()) {
      setErr('El grupo necesita un nombre');
      return;
    }
    startCreate(async () => {
      const r = await crearConversacionAction({
        tipo,
        nombre: tipo === 'GRUPO' ? nombreGrupo.trim() : undefined,
        participantesIds: seleccion.map((s) => s.id),
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      void mutate('chat:conversaciones');
      onCreado(r.conversacionId);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <h3 className="font-heading text-base font-semibold text-slate-900">Nuevo chat</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Solo aparecen usuarios con los que tu rol puede iniciar conversación.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          {/* Tipo */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => {
                setTipo('DM');
                setSeleccion((s) => s.slice(0, 1));
              }}
              className={cn(
                'flex-1 rounded-md py-1.5 text-xs font-medium transition',
                tipo === 'DM' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
              )}
            >
              Directo (1:1)
            </button>
            <button
              type="button"
              onClick={() => setTipo('GRUPO')}
              className={cn(
                'flex-1 rounded-md py-1.5 text-xs font-medium transition',
                tipo === 'GRUPO' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
              )}
            >
              <Users2 className="mr-1 inline h-3 w-3" />
              Grupo
            </button>
          </div>

          {tipo === 'GRUPO' && (
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Nombre del grupo
              </label>
              <input
                type="text"
                value={nombreGrupo}
                onChange={(e) => setNombreGrupo(e.target.value)}
                placeholder="Ej. Soporte Cartera Q2"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
                maxLength={80}
              />
            </div>
          )}

          {/* Seleccionados (chips) */}
          {seleccion.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {seleccion.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] font-medium text-brand-blue-dark"
                >
                  {u.name}
                  <button
                    type="button"
                    onClick={() => quitar(u.id)}
                    className="rounded-full hover:bg-brand-blue/20"
                    aria-label="Quitar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Buscador */}
          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre o correo…"
                className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
              />
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
              {items.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-slate-400">
                  {q ? 'Sin resultados' : 'Escribe para buscar'}
                </p>
              )}
              {items.map((u) => {
                const elegido = seleccion.some((s) => s.id === u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUser(u)}
                    className={cn(
                      'flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-xs transition hover:bg-slate-50',
                      elegido && 'bg-brand-blue/5',
                    )}
                  >
                    <div>
                      <p className="font-medium text-slate-900">{u.name}</p>
                      <p className="text-[10px] text-slate-500">{u.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        {ROLE_LABEL[u.role] ?? u.role}
                      </p>
                      {u.sucursalCodigo && (
                        <p className="font-mono text-[10px] text-slate-500">{u.sucursalCodigo}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {err && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
              {err}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={crear}
            disabled={creando}
            className="rounded-lg bg-brand-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-blue-dark disabled:opacity-60"
          >
            {creando ? 'Creando…' : tipo === 'DM' ? 'Abrir chat' : 'Crear grupo'}
          </button>
        </footer>
      </div>
    </div>
  );
}
