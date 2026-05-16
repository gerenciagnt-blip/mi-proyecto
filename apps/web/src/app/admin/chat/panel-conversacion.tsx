'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import {
  Send,
  Paperclip,
  X,
  ImageIcon,
  Star,
  Lock,
  Unlock,
  CheckCircle2,
  MoreVertical,
  Pencil,
  Trash2,
  Check as CheckIcon,
  Search,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  enviarMensajeAction,
  editarMensajeAction,
  borrarMensajeAction,
  listarMensajesAction,
  marcarLeidoAction,
  type MensajeItem,
  type MensajeAdjuntoItem,
  type ConversacionMeta,
} from './actions';
import {
  cerrarConversacionAction,
  reabrirConversacionAction,
  calificarConversacionAction,
} from './cierre-actions';

// Sprint Chat · SSE — el push real lo hace EventSource (latencia ~200ms).
// Este polling sirve como FALLBACK cuando la conexión SSE se cae o el
// browser tarda en reconectar. Lo subimos a 30s para no duplicar carga
// con el push.
const REFRESH_INTERVAL_MS = 30_000;

const MIMES_IMAGEN = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const TAMANO_MAX = 5 * 1024 * 1024;
const MAX_ADJUNTOS = 6;

function fmtHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diaMsg = new Date(d);
  diaMsg.setHours(0, 0, 0, 0);
  const diff = (hoy.getTime() - diaMsg.getTime()) / 86_400_000;
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Sprint Chat búsqueda — escapa caracteres de regex para usar el query
 * literal en `new RegExp(...)`.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resalta coincidencias de `query` dentro de `texto`, retornando un
 * fragmento React con `<mark>` envolviendo cada match. Case-insensitive.
 * Si no hay query, devuelve el texto crudo.
 */
function resaltarTexto(texto: string, query: string): React.ReactNode {
  if (!query) return texto;
  const re = new RegExp(`(${escapeRegex(query)})`, 'gi');
  const partes = texto.split(re);
  // split con grupo captura preserva los matches en posiciones impares.
  return partes.map((p, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-yellow-200 px-0.5 text-slate-900">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

type FetchMensajesResult = { items: MensajeItem[]; meta: ConversacionMeta };

async function fetchMensajes(conversacionId: string): Promise<FetchMensajesResult> {
  const r = await listarMensajesAction(conversacionId);
  if (!r.ok) throw new Error(r.error);
  return { items: r.items, meta: r.meta };
}

/**
 * Lee del localStorage si el user ya skipeo la calificación de un ciclo
 * particular ("Más tarde"). Si sí, no le mostramos el modal de nuevo
 * para ese mismo (conv, ciclo) — pero queda calificable manualmente
 * desde el dashboard de soporte si lo decide después.
 */
function skipKey(conversacionId: string, ciclo: number) {
  return `chat:rate:skipped:${conversacionId}:${ciclo}`;
}
function yaSkipeado(conversacionId: string, ciclo: number): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(skipKey(conversacionId, ciclo)) === '1';
}
function marcarSkipeado(conversacionId: string, ciclo: number) {
  localStorage.setItem(skipKey(conversacionId, ciclo), '1');
}

/**
 * Lee el ancho/alto de un File de imagen creando un Image temporal.
 * Resuelve { ancho, alto } o null si no se pudo leer.
 */
function leerDimensiones(file: File): Promise<{ ancho: number; alto: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ ancho: img.naturalWidth, alto: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

type AdjuntoPendiente = {
  file: File;
  previewUrl: string;
  ancho?: number;
  alto?: number;
};

/**
 * Sprint Chat interno — panel principal con scroll de mensajes y composer
 * inferior. Polling con SWR cada 3s. Soporta adjuntar imágenes (botón 📎)
 * y pegar desde clipboard (Ctrl+V).
 */
export function PanelConversacion({ conversacionId }: { conversacionId: string }) {
  const { mutate } = useSWRConfig();
  const { data, error, isLoading } = useSWR(
    ['chat:mensajes', conversacionId],
    () => fetchMensajes(conversacionId),
    {
      refreshInterval: REFRESH_INTERVAL_MS,
      revalidateOnFocus: true,
    },
  );
  const items = data?.items;
  const meta = data?.meta;
  const estado = meta?.estado ?? 'ABIERTA';
  const cerrada = estado === 'CERRADA';

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [borrador, setBorrador] = useState('');
  const [adjuntos, setAdjuntos] = useState<AdjuntoPendiente[]>([]);
  const [enviando, startEnvio] = useTransition();
  const [enviarErr, setEnviarErr] = useState<string | null>(null);
  const [previewLightbox, setPreviewLightbox] = useState<string | null>(null);
  const [cerrando, startCerrar] = useTransition();
  const [mostrarRating, setMostrarRating] = useState(false);

  // ─── Búsqueda dentro de la conversación ─────────────────────────────
  // Toggle, query y match activo. Calculamos los matches con useMemo
  // (lista de mensajeIds que contienen el query). El scroll automático
  // al match activo lo hace un useEffect.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !items) return [] as string[];
    const out: string[] = [];
    for (const m of items) {
      if (!m.contenido) continue;
      if (m.borradoAt) continue;
      if (m.contenido.toLowerCase().includes(q)) out.push(m.id);
    }
    return out;
  }, [items, searchQuery]);

  // Reset del índice cuando cambia la lista de matches.
  useEffect(() => {
    setActiveMatchIdx(0);
  }, [searchQuery]);

  const activeMatchId = matches[activeMatchIdx] ?? null;

  // Auto-scroll al fondo cuando llega contenido nuevo. Se desactiva
  // mientras hay búsqueda activa — en ese caso, el scroll lo controla
  // el match activo (efecto debajo).
  useEffect(() => {
    if (!scrollRef.current) return;
    if (searchOpen && searchQuery) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items?.length, searchOpen, searchQuery]);

  // Scrollea el match activo a la vista.
  useEffect(() => {
    if (!activeMatchId) return;
    const el = document.getElementById(`msg-${activeMatchId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeMatchId]);

  // Marca como leído al abrir/recibir mensajes; revalida la sidebar para
  // que el badge baje. Best-effort, sin bloquear UI.
  useEffect(() => {
    void marcarLeidoAction(conversacionId).then(() => {
      void mutate('chat:conversaciones');
    });
  }, [conversacionId, items?.length, mutate]);

  // Si debe calificar (no-staff + conv cerrada + no calificó + no
  // skipeo este ciclo), mostramos el modal automáticamente.
  useEffect(() => {
    if (!meta) return;
    if (meta.debeCalificar && !yaSkipeado(meta.id, meta.ciclo)) {
      setMostrarRating(true);
    } else {
      setMostrarRating(false);
    }
  }, [meta]);

  // Libera URLs de previews al desmontar.
  useEffect(() => {
    return () => {
      adjuntos.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function agregarArchivos(files: File[]) {
    setEnviarErr(null);
    const validados: AdjuntoPendiente[] = [];
    for (const f of files) {
      if (adjuntos.length + validados.length >= MAX_ADJUNTOS) {
        setEnviarErr(`Máximo ${MAX_ADJUNTOS} adjuntos por mensaje`);
        break;
      }
      if (!MIMES_IMAGEN.includes(f.type)) {
        setEnviarErr(`Solo imágenes (jpeg/png/webp/gif): "${f.name}"`);
        continue;
      }
      if (f.size > TAMANO_MAX) {
        setEnviarErr(`"${f.name}" supera 5 MB`);
        continue;
      }
      const dims = await leerDimensiones(f);
      validados.push({
        file: f,
        previewUrl: URL.createObjectURL(f),
        ancho: dims?.ancho,
        alto: dims?.alto,
      });
    }
    setAdjuntos((prev) => [...prev, ...validados]);
  }

  function quitarAdjunto(idx: number) {
    setAdjuntos((prev) => {
      const out = [...prev];
      const removed = out.splice(idx, 1);
      removed.forEach((r) => URL.revokeObjectURL(r.previewUrl));
      return out;
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    void agregarArchivos(files);
    e.target.value = ''; // permite re-seleccionar el mismo archivo
  }

  /**
   * Handler de paste: extrae imágenes del clipboard. Útil para pegar
   * screenshots con Ctrl+V directamente.
   */
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageFiles: File[] = [];
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      void agregarArchivos(imageFiles);
    }
  }

  function enviar(e?: React.FormEvent) {
    e?.preventDefault();
    const texto = borrador.trim();
    if (!texto && adjuntos.length === 0) return;
    if (enviando) return;
    setEnviarErr(null);

    const fd = new FormData();
    fd.append('conversacionId', conversacionId);
    fd.append('contenido', texto);
    adjuntos.forEach((a, i) => {
      fd.append('archivo', a.file, a.file.name);
      if (a.ancho && a.alto) {
        fd.append(`dim:${i}`, `${a.ancho}x${a.alto}`);
      }
    });

    startEnvio(async () => {
      const r = await enviarMensajeAction(fd);
      if (!r.ok) {
        setEnviarErr(r.error);
        return;
      }
      // Limpieza
      adjuntos.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      setAdjuntos([]);
      setBorrador('');
      void mutate(['chat:mensajes', conversacionId]);
      void mutate('chat:conversaciones');
    });
  }

  function cerrarChat() {
    startCerrar(async () => {
      const r = await cerrarConversacionAction(conversacionId);
      if (!r.error) {
        void mutate(['chat:mensajes', conversacionId]);
        void mutate('chat:conversaciones');
      } else {
        setEnviarErr(r.error);
      }
    });
  }

  function reabrirChat() {
    startCerrar(async () => {
      const r = await reabrirConversacionAction(conversacionId);
      if (!r.error) {
        void mutate(['chat:mensajes', conversacionId]);
        void mutate('chat:conversaciones');
      } else {
        setEnviarErr(r.error);
      }
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header con estado + acciones de cierre + lupa de búsqueda */}
      {meta && (
        <HeaderConversacion
          meta={meta}
          cerrando={cerrando}
          onCerrar={cerrarChat}
          busquedaActiva={searchOpen}
          onToggleBusqueda={() => {
            setSearchOpen((v) => {
              const nuevo = !v;
              if (!nuevo) setSearchQuery('');
              return nuevo;
            });
          }}
        />
      )}
      {searchOpen && (
        <BarraBusqueda
          query={searchQuery}
          onQueryChange={setSearchQuery}
          matchesCount={matches.length}
          activeIdx={activeMatchIdx}
          onPrev={() =>
            setActiveMatchIdx((i) =>
              matches.length === 0 ? 0 : (i - 1 + matches.length) % matches.length,
            )
          }
          onNext={() =>
            setActiveMatchIdx((i) => (matches.length === 0 ? 0 : (i + 1) % matches.length))
          }
          onClose={() => {
            setSearchOpen(false);
            setSearchQuery('');
          }}
        />
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading && !items && (
          <p className="text-center text-xs text-slate-400">Cargando mensajes…</p>
        )}
        {error && (
          <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error instanceof Error ? error.message : 'Error al cargar mensajes'}
          </div>
        )}
        {items && items.length === 0 && (
          <p className="text-center text-xs text-slate-400">
            Aún no hay mensajes. Escribe el primero abajo 👇
          </p>
        )}
        {items && meta && (
          <MensajesLista
            items={items}
            meta={meta}
            onAbrirLightbox={(url) => setPreviewLightbox(url)}
            searchQuery={searchOpen ? searchQuery : ''}
            activeMatchId={searchOpen ? activeMatchId : null}
          />
        )}
      </div>

      {/* Si cerrada: banner con reabrir en lugar del composer */}
      {cerrada ? (
        <BannerCerrada meta={meta!} reabriendo={cerrando} onReabrir={reabrirChat} />
      ) : (
        <form onSubmit={enviar} className="border-t border-slate-200 bg-slate-50">
          {/* Previews de adjuntos pendientes */}
          {adjuntos.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-slate-200 px-3 py-2">
              {adjuntos.map((a, idx) => (
                <div
                  key={idx}
                  className="group relative h-16 w-16 overflow-hidden rounded-md ring-1 ring-slate-300"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.previewUrl}
                    alt={a.file.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => quitarAdjunto(idx)}
                    className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-900/70 text-white opacity-0 transition group-hover:opacity-100"
                    aria-label="Quitar"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {enviarErr && (
            <div className="mx-3 mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              {enviarErr}
            </div>
          )}

          <div className="flex items-end gap-2 px-3 py-3">
            {/* Botón adjuntar */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={enviando}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-brand-blue disabled:opacity-50"
              title="Adjuntar imagen (también puedes pegar con Ctrl+V)"
              aria-label="Adjuntar imagen"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={MIMES_IMAGEN.join(',')}
              className="hidden"
              onChange={onFileChange}
            />

            <textarea
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              rows={2}
              placeholder="Escribe un mensaje… (Enter envía, Ctrl+V pega imagen)"
              className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
              maxLength={4000}
            />
            <button
              type="submit"
              disabled={enviando || (!borrador.trim() && adjuntos.length === 0)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-blue-dark disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </form>
      )}

      {/* Modal de calificación — aparece automáticamente cuando el aliado
         abre una conv cerrada y aún no calificó este ciclo. Tiene 3
         salidas: enviar calificación, "Más tarde" (skip), o "Reabrir
         sin calificar" (dispara reabrirChat, que cambia el meta.estado
         y por consecuencia debeCalificar=false → modal se cierra solo). */}
      {mostrarRating && meta && (
        <ModalCalificacion
          conversacionId={conversacionId}
          ciclo={meta.ciclo}
          onClose={(skipeado) => {
            if (skipeado) marcarSkipeado(conversacionId, meta.ciclo);
            setMostrarRating(false);
            void mutate(['chat:mensajes', conversacionId]);
          }}
          onReabrir={() => {
            // Skip implícito del ciclo actual — sino el modal volvería
            // a aparecer la próxima vez que esta conv se cierre (sin
            // que el aliado haya calificado este ciclo). Se reabre
            // limpio y entra a un ciclo nuevo.
            marcarSkipeado(conversacionId, meta.ciclo);
            setMostrarRating(false);
            reabrirChat();
          }}
        />
      )}

      {/* Lightbox simple para ver imagen ampliada */}
      {previewLightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPreviewLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewLightbox}
            alt="Imagen ampliada"
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function MensajesLista({
  items,
  meta,
  onAbrirLightbox,
  searchQuery,
  activeMatchId,
}: {
  items: MensajeItem[];
  meta: ConversacionMeta;
  onAbrirLightbox: (url: string) => void;
  searchQuery: string;
  activeMatchId: string | null;
}) {
  // Agrupa por día para insertar separadores.
  const dias = new Map<string, MensajeItem[]>();
  for (const m of items) {
    const k = m.createdAt.slice(0, 10);
    if (!dias.has(k)) dias.set(k, []);
    dias.get(k)!.push(m);
  }

  return (
    <div className="space-y-4">
      {Array.from(dias.entries()).map(([dia, msgs]) => (
        <div key={dia} className="space-y-1.5">
          <div className="sticky top-0 z-10 mx-auto w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {fmtFecha(msgs[0]!.createdAt)}
          </div>
          {msgs.map((m, idx) => {
            const anterior = msgs[idx - 1];
            const mismoAutor = anterior?.autor.id === m.autor.id;
            return (
              <Mensaje
                key={m.id}
                m={m}
                meta={meta}
                mostrarAutor={!mismoAutor}
                onAbrirLightbox={onAbrirLightbox}
                searchQuery={searchQuery}
                esMatchActivo={activeMatchId === m.id}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Ventana del cliente para mostrar el botón "Editar" (debe coincidir
 *  con `VENTANA_EDIT_MS` del server: 15 min). */
const VENTANA_EDIT_CLIENT_MS = 15 * 60 * 1000;

function Mensaje({
  m,
  meta,
  mostrarAutor,
  onAbrirLightbox,
  searchQuery,
  esMatchActivo,
}: {
  m: MensajeItem;
  meta: ConversacionMeta;
  mostrarAutor: boolean;
  onAbrirLightbox: (url: string) => void;
  searchQuery: string;
  esMatchActivo: boolean;
}) {
  const borrado = !!m.borradoAt;
  const esMio = m.autor.id === meta.meId;
  const dentroVentanaEdit = Date.now() - new Date(m.createdAt).getTime() < VENTANA_EDIT_CLIENT_MS;
  const convAbierta = meta.estado === 'ABIERTA';
  // Reglas de menú (mismas que el server):
  //   - Editar: solo el autor, conv abierta, mensaje no borrado, dentro ventana
  //   - Borrar: autor siempre; ADMIN-conv si autor no es ADMIN/SOPORTE (no validamos rol del autor acá — el server rechaza)
  const puedeEditar = esMio && convAbierta && !borrado && dentroVentanaEdit;
  const puedeBorrar = (esMio || meta.soyAdminConv) && !borrado;

  const [menuOpen, setMenuOpen] = useState(false);
  const [editando, setEditando] = useState(false);
  const [borrando, startBorrar] = useTransition();
  const [editTexto, setEditTexto] = useState(m.contenido);
  const [editPending, startEdit] = useTransition();
  const [editErr, setEditErr] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  function cancelarEdit() {
    setEditando(false);
    setEditTexto(m.contenido);
    setEditErr(null);
  }

  function guardarEdit() {
    const nuevo = editTexto.trim();
    if (!nuevo) {
      setEditErr('No puede quedar vacío');
      return;
    }
    if (nuevo === m.contenido) {
      cancelarEdit();
      return;
    }
    setEditErr(null);
    startEdit(async () => {
      const r = await editarMensajeAction(m.id, nuevo);
      if (!r.ok) {
        setEditErr(r.error);
        return;
      }
      setEditando(false);
      void mutate(['chat:mensajes', meta.id]);
      void mutate('chat:conversaciones');
    });
  }

  function borrar() {
    if (!confirm('¿Borrar este mensaje? No se puede deshacer.')) return;
    setMenuOpen(false);
    startBorrar(async () => {
      const r = await borrarMensajeAction(m.id);
      if (r.error) {
        alert(r.error);
        return;
      }
      void mutate(['chat:mensajes', meta.id]);
      void mutate('chat:conversaciones');
    });
  }

  return (
    <div
      id={`msg-${m.id}`}
      className={cn(
        'group flex flex-col',
        mostrarAutor && 'mt-3',
        esMatchActivo && 'rounded-md ring-2 ring-yellow-400/70',
      )}
    >
      {mostrarAutor && (
        <p className="px-1 text-[11px] font-semibold text-slate-700">{m.autor.name}</p>
      )}
      {m.adjuntos.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1.5">
          {m.adjuntos.map((a) => (
            <AdjuntoMiniatura key={a.id} a={a} onAbrir={onAbrirLightbox} />
          ))}
        </div>
      )}
      {editando ? (
        <div className="flex flex-col gap-1">
          <textarea
            value={editTexto}
            onChange={(e) => setEditTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelarEdit();
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                guardarEdit();
              }
            }}
            rows={2}
            maxLength={4000}
            className="rounded-lg border border-brand-blue/40 bg-white px-2 py-1 text-sm text-slate-800 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
            autoFocus
          />
          {editErr && <p className="text-[10px] text-red-700">{editErr}</p>}
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <button
              type="button"
              onClick={guardarEdit}
              disabled={editPending}
              className="inline-flex items-center gap-0.5 rounded bg-brand-blue px-1.5 py-0.5 text-white hover:bg-brand-blue-dark disabled:opacity-50"
            >
              <CheckIcon className="h-2.5 w-2.5" />
              {editPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={cancelarEdit}
              disabled={editPending}
              className="rounded px-1.5 py-0.5 text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <span className="ml-1">Esc para cancelar · Ctrl+Enter para guardar</span>
          </div>
        </div>
      ) : (
        m.contenido && (
          <div className="flex items-baseline gap-2">
            <p
              className={cn(
                'whitespace-pre-wrap rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-800',
                borrado && 'italic text-slate-400',
                borrando && 'opacity-50',
              )}
            >
              {borrado ? m.contenido : resaltarTexto(m.contenido, searchQuery)}
            </p>
            <span className="text-[10px] text-slate-400">
              {fmtHora(m.createdAt)}
              {m.editadoAt && !borrado ? ' · editado' : ''}
            </span>
            {(puedeEditar || puedeBorrar) && (
              <div className="relative opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  aria-label="Opciones del mensaje"
                >
                  <MoreVertical className="h-3 w-3" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-5 z-20 flex flex-col rounded-md border border-slate-200 bg-white py-1 shadow-md ring-1 ring-slate-200">
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setEditando(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3 w-3" />
                          Editar
                        </button>
                      )}
                      {puedeBorrar && (
                        <button
                          type="button"
                          onClick={borrar}
                          disabled={borrando}
                          className="flex items-center gap-1.5 px-3 py-1 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          {borrando ? 'Borrando…' : 'Borrar'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      )}
      {!editando && !m.contenido && m.adjuntos.length > 0 && (
        <span className="px-1 text-[10px] text-slate-400">{fmtHora(m.createdAt)}</span>
      )}
    </div>
  );
}

function AdjuntoMiniatura({
  a,
  onAbrir,
}: {
  a: MensajeAdjuntoItem;
  onAbrir: (url: string) => void;
}) {
  const esImagen = a.mime.startsWith('image/');
  if (!esImagen) {
    return (
      <a
        href={a.url}
        download={a.nombre}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
      >
        <ImageIcon className="h-3 w-3" />
        {a.nombre}
      </a>
    );
  }
  // Aspecto del thumb basado en dimensiones reales (cuando vienen).
  const ratio = a.ancho && a.alto ? a.ancho / a.alto : 1;
  const altoThumb = 140;
  const anchoThumb = Math.max(80, Math.min(280, Math.round(altoThumb * ratio)));
  return (
    <button
      type="button"
      onClick={() => onAbrir(a.url)}
      className="overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-brand-blue"
      style={{ width: anchoThumb, height: altoThumb }}
      title={a.nombre}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.url} alt={a.nombre} className="h-full w-full object-cover" />
    </button>
  );
}

// ============ Header de conversación ============

function HeaderConversacion({
  meta,
  cerrando,
  onCerrar,
  onToggleBusqueda,
  busquedaActiva,
}: {
  meta: ConversacionMeta;
  cerrando: boolean;
  onCerrar: () => void;
  onToggleBusqueda: () => void;
  busquedaActiva: boolean;
}) {
  const cerrada = meta.estado === 'CERRADA';
  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
      <div className="flex items-center gap-2 text-xs">
        {cerrada ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
              <Lock className="h-2.5 w-2.5" />
              Cerrada
            </span>
            <span className="text-[11px] text-slate-500">
              {meta.cerradaPorInactividad
                ? 'por inactividad (30 min)'
                : meta.cerradaPorNombre
                  ? `por ${meta.cerradaPorNombre}`
                  : ''}
              {meta.cerradaAt &&
                ` · ${new Date(meta.cerradaAt).toLocaleString('es-CO', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <Unlock className="h-2.5 w-2.5" />
            Abierta
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleBusqueda}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-brand-blue',
            busquedaActiva && 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/30',
          )}
          title="Buscar en la conversación"
          aria-label="Buscar"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
        {!cerrada && (
          <button
            type="button"
            onClick={onCerrar}
            disabled={cerrando}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 hover:text-red-600 disabled:opacity-60"
            title="Cierra la conversación y dispara la calificación"
          >
            <Lock className="h-3 w-3" />
            {cerrando ? 'Cerrando…' : 'Cerrar chat'}
          </button>
        )}
      </div>
    </div>
  );
}

// ============ Barra de búsqueda dentro de la conversación ============

function BarraBusqueda({
  query,
  onQueryChange,
  matchesCount,
  activeIdx,
  onPrev,
  onNext,
  onClose,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  matchesCount: number;
  activeIdx: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const hayMatches = matchesCount > 0;
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          }
        }}
        placeholder="Buscar en esta conversación…"
        className="h-7 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[2px] focus:ring-brand-blue/15"
      />
      <span className="min-w-[44px] text-right text-[11px] tabular-nums text-slate-500">
        {query.trim() === ''
          ? ''
          : hayMatches
            ? `${activeIdx + 1} / ${matchesCount}`
            : 'Sin resultados'}
      </span>
      <button
        type="button"
        onClick={onPrev}
        disabled={!hayMatches}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30"
        title="Anterior (Shift+Enter)"
        aria-label="Anterior"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!hayMatches}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30"
        title="Siguiente (Enter)"
        aria-label="Siguiente"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200"
        title="Cerrar búsqueda (Esc)"
        aria-label="Cerrar búsqueda"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ============ Banner conv cerrada (reemplaza el composer) ============

function BannerCerrada({
  meta,
  reabriendo,
  onReabrir,
}: {
  meta: ConversacionMeta;
  reabriendo: boolean;
  onReabrir: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-4 text-center">
      <p className="text-xs text-slate-500">
        Esta conversación está cerrada
        {meta.cerradaPorInactividad ? ' por inactividad.' : '.'}
      </p>
      <button
        type="button"
        onClick={onReabrir}
        disabled={reabriendo}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-blue-dark disabled:opacity-60"
      >
        <Unlock className="h-3 w-3" />
        {reabriendo ? 'Reabriendo…' : 'Reabrir conversación'}
      </button>
    </div>
  );
}

// ============ Modal de calificación (1-5 estrellas) ============

function ModalCalificacion({
  conversacionId,
  ciclo,
  onClose,
  onReabrir,
}: {
  conversacionId: string;
  ciclo: number;
  /**
   * Cierra el modal. `skipeado=true` cuando el user pulsó "Más tarde"
   * (se marca en localStorage para no volver a molestar este ciclo).
   * Para calificación exitosa o "Reabrir" no skipeamos (la conv cambia
   * de estado y eso resetea el flujo por sí solo).
   */
  onClose: (skipeado: boolean) => void;
  /**
   * Dispara la reapertura de la conv. El parent maneja la llamada al
   * server y el cierre del modal por el cambio de meta.estado.
   */
  onReabrir: () => void;
}) {
  const [puntaje, setPuntaje] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, startEnvio] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  function enviar() {
    if (puntaje < 1) {
      setErr('Selecciona al menos una estrella');
      return;
    }
    setErr(null);
    startEnvio(async () => {
      const r = await calificarConversacionAction({
        conversacionId,
        puntaje,
        comentario: comentario.trim() || undefined,
      });
      if (r.error) {
        setErr(r.error);
        return;
      }
      setExito(true);
      setTimeout(() => onClose(false), 1500);
    });
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-4"
      // No cerramos al click fuera — el aliado debe usar "Más tarde" o calificar.
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
        {exito ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-medium text-slate-800">¡Gracias por tu calificación!</p>
          </div>
        ) : (
          <>
            <header className="mb-4">
              <h3 className="font-heading text-base font-semibold text-slate-900">
                Califica el soporte recibido
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Tu opinión nos ayuda a mejorar la atención del equipo de soporte.
              </p>
            </header>

            {/* Estrellas */}
            <div className="mb-3 flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => {
                const activo = (hover || puntaje) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setPuntaje(n)}
                    className="p-1 transition hover:scale-110"
                    aria-label={`${n} estrellas`}
                  >
                    <Star
                      className={cn(
                        'h-9 w-9 transition',
                        activo ? 'fill-amber-400 text-amber-400' : 'text-slate-300',
                      )}
                    />
                  </button>
                );
              })}
            </div>
            {puntaje > 0 && (
              <p className="mb-3 text-center text-xs font-medium text-slate-700">
                {['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'][puntaje - 1]}
              </p>
            )}

            <label className="mb-3 block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Comentario (opcional)
              </span>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="¿Algo que destacar o mejorar?"
                rows={3}
                maxLength={1000}
                className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
              />
            </label>

            {err && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                {err}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  // Reabrir: el parent ejecuta la action; el cierre del
                  // modal se hace por el cambio de meta.estado (debe
                  // Calificar pasa a false cuando la conv pasa a ABIERTA).
                  onReabrir();
                }}
                disabled={enviando}
                className="rounded-lg border border-brand-blue/40 bg-white px-3 py-1.5 text-sm font-medium text-brand-blue-dark hover:bg-brand-blue/5"
                title="Reabrir la conversación sin calificar todavía"
              >
                Reabrir sin calificar
              </button>
              <button
                type="button"
                onClick={() => onClose(true)}
                disabled={enviando}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Más tarde
              </button>
              <button
                type="button"
                onClick={enviar}
                disabled={enviando || puntaje < 1}
                className="rounded-lg bg-brand-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-blue-dark disabled:opacity-60"
              >
                {enviando ? 'Enviando…' : 'Enviar calificación'}
              </button>
            </div>
          </>
        )}
        <p className="mt-3 text-center text-[10px] text-slate-400">
          Ciclo de conversación #{ciclo}
        </p>
      </div>
    </div>
  );
}
