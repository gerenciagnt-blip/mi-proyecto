'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Send, Paperclip, X, ImageIcon, Star, Lock, Unlock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  enviarMensajeAction,
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

  // Auto-scroll al fondo cuando llega contenido nuevo.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items?.length]);

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
      {/* Header con estado + acciones de cierre */}
      {meta && <HeaderConversacion meta={meta} cerrando={cerrando} onCerrar={cerrarChat} />}

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
        {items && (
          <MensajesLista items={items} onAbrirLightbox={(url) => setPreviewLightbox(url)} />
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
  onAbrirLightbox,
}: {
  items: MensajeItem[];
  onAbrirLightbox: (url: string) => void;
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
                mostrarAutor={!mismoAutor}
                onAbrirLightbox={onAbrirLightbox}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Mensaje({
  m,
  mostrarAutor,
  onAbrirLightbox,
}: {
  m: MensajeItem;
  mostrarAutor: boolean;
  onAbrirLightbox: (url: string) => void;
}) {
  const borrado = !!m.borradoAt;
  return (
    <div className={cn('group flex flex-col', mostrarAutor && 'mt-3')}>
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
      {m.contenido && (
        <div className="flex items-baseline gap-2">
          <p
            className={cn(
              'whitespace-pre-wrap rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-800',
              borrado && 'italic text-slate-400',
            )}
          >
            {m.contenido}
          </p>
          <span className="text-[10px] text-slate-400">
            {fmtHora(m.createdAt)}
            {m.editadoAt && !borrado ? ' · editado' : ''}
          </span>
        </div>
      )}
      {!m.contenido && m.adjuntos.length > 0 && (
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
}: {
  meta: ConversacionMeta;
  cerrando: boolean;
  onCerrar: () => void;
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
