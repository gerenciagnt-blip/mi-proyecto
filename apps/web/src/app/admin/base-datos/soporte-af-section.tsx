'use client';

import { useEffect, useState } from 'react';
import { Download, History, Paperclip, FileCheck, Loader2, UserCheck, Shield } from 'lucide-react';
import type {
  ColpatriaJobStatus,
  SoporteAfAccionadaPor,
  SoporteAfEstado,
  SoporteAfTipoDisparo,
} from '@pila/db';
import { cn } from '@/lib/utils';
import { arlStatusFromBot } from '@/lib/soporte-af/arl-status';
import { listarSoportesPorAfiliacionAction } from './actions';

const ESTADO_LABEL: Record<SoporteAfEstado, string> = {
  EN_PROCESO: 'En proceso',
  PROCESADA: 'Procesada',
  RECHAZADA: 'Rechazada',
  NOVEDAD: 'Novedad',
};
const ESTADO_TONE: Record<SoporteAfEstado, string> = {
  EN_PROCESO: 'bg-sky-50 text-sky-700 ring-sky-200',
  PROCESADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RECHAZADA: 'bg-red-50 text-red-700 ring-red-200',
  NOVEDAD: 'bg-amber-50 text-amber-700 ring-amber-200',
};
const DISPARO_LABEL: Record<SoporteAfTipoDisparo, string> = {
  NUEVA: 'Nueva',
  REACTIVACION: 'Reactivación',
  CAMBIO_FECHA_INGRESO: 'Cambio fecha',
  CAMBIO_EMPRESA: 'Cambio empresa',
  CAMBIO_NIVEL_ARL: 'Cambio nivel ARL',
  CAMBIO_PLAN_SGSS: 'Cambio plan',
};

type Solicitud = {
  id: string;
  consecutivo: string;
  fechaRadicacion: string;
  disparos: SoporteAfTipoDisparo[];
  estado: SoporteAfEstado;
  estadoObservaciones: string | null;
  creadoPor: string | null;
  gestionadoPor: string | null;
  gestionadoEn: string | null;
  /** Sprint Soporte reorg — usuario STAFF asignado a la solicitud. */
  asignadoA: { id: string; name: string } | null;
  documentos: Array<{
    id: string;
    nombre: string;
    tamano: number;
    accionadaPor: SoporteAfAccionadaPor;
    eliminado: boolean;
    fecha: string;
  }>;
  gestiones: Array<{
    id: string;
    accionadaPor: SoporteAfAccionadaPor;
    descripcion: string;
    nuevoEstado: SoporteAfEstado | null;
    userName: string | null;
    fecha: string;
  }>;
};

/** Sprint Soporte reorg — info del bot ARL (compartida por todas las
 *  solicitudes de la misma afiliación). */
type ArlBot = {
  planIncluyeArl: boolean;
  empresaColpatriaActivo: boolean;
  lastJob: {
    id: string;
    status: ColpatriaJobStatus;
    intento: number;
    pdfPath: string | null;
    pdfArchivedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  } | null;
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-CO')} · ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
}

function inicialesDe(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function SoporteAfSection({ afiliacionId }: { afiliacionId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Solicitud[]>([]);
  const [arlBot, setArlBot] = useState<ArlBot | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listarSoportesPorAfiliacionAction(afiliacionId)
      .then((res) => {
        if (cancelled) return;
        if ('error' in res && res.error) {
          setError(res.error);
          setItems([]);
          setArlBot(null);
        } else if ('items' in res) {
          setItems(res.items);
          setArlBot(res.arlBot);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Error al cargar');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [afiliacionId]);

  // Estado del bot para mostrar (sólo si plan ARL + empresa colpatriaActivo).
  const arlStatus = arlBot
    ? arlStatusFromBot({
        planIncluyeArl: arlBot.planIncluyeArl,
        empresaColpatriaActivo: arlBot.empresaColpatriaActivo,
        lastJobStatus: arlBot.lastJob?.status ?? null,
      })
    : null;

  return (
    <section className="rounded-2xl border border-brand-border bg-brand-surface px-4 py-4">
      <header className="mb-3 flex items-center gap-2">
        <FileCheck className="h-4 w-4 text-brand-blue" />
        <h3 className="text-sm font-semibold text-slate-700">Soporte Afiliaciones</h3>
        {items.length > 0 && (
          <span className="font-mono text-[10px] text-slate-500">({items.length})</span>
        )}
      </header>

      {loading && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
        </p>
      )}

      {!loading && error && <p className="text-xs text-red-600">{error}</p>}

      {/* Bot ARL Colpatria — sólo si aplica a esta afiliación. Se muestra
          arriba de las solicitudes porque la información es de la
          afiliación, no de cada solicitud. */}
      {!loading && !error && arlStatus && arlBot && (
        <div className="mb-3 rounded-lg border border-emerald-200/70 bg-emerald-50/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-[11px] font-semibold text-emerald-800">Bot ARL · Colpatria</span>
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                arlStatus.tone,
              )}
            >
              {arlStatus.label}
            </span>
            {arlBot.lastJob && (
              <span className="text-[10px] text-slate-500">
                Intento <span className="font-mono">{arlBot.lastJob.intento}</span>
                {arlBot.lastJob.finishedAt && <> · {fmtDateTime(arlBot.lastJob.finishedAt)}</>}
              </span>
            )}
            {arlBot.lastJob?.status === 'SUCCESS' &&
              arlBot.lastJob.pdfPath &&
              !arlBot.lastJob.pdfArchivedAt && (
                <a
                  href={`/api/colpatria/jobs/${arlBot.lastJob.id}/pdf`}
                  target="_blank"
                  rel="noopener"
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  <Download className="h-2.5 w-2.5" />
                  PDF afiliación
                </a>
              )}
          </div>
          {arlBot.lastJob?.error && (
            <p className="mt-1.5 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700">
              {arlBot.lastJob.error}
            </p>
          )}
          {arlBot.lastJob?.status === 'SUCCESS' && arlBot.lastJob.pdfArchivedAt && (
            <p className="mt-1.5 text-[10px] italic text-slate-500">
              PDF archivado por retención — solo metadata disponible.
            </p>
          )}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-xs text-slate-500">
          Sin solicitudes en la bandeja de soporte para esta afiliación.
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((s) => (
            <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-slate-900">
                  {s.consecutivo}
                </span>
                <span
                  className={cn(
                    'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                    ESTADO_TONE[s.estado],
                  )}
                >
                  {ESTADO_LABEL[s.estado]}
                </span>
                {s.disparos.map((d) => (
                  <span
                    key={d}
                    className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-700"
                  >
                    {DISPARO_LABEL[d]}
                  </span>
                ))}
                <span className="ml-auto text-[10px] text-slate-500">
                  {fmtDateTime(s.fechaRadicacion)}
                </span>
              </div>

              {/* Asignado a — chip compacto. La asignación se gestiona desde
                  /admin/soporte/afiliaciones (read-only acá para no
                  duplicar el popover). */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                <UserCheck className="h-3 w-3 text-slate-400" />
                <span className="text-slate-500">Asignada a:</span>
                {s.asignadoA ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-blue/10 text-[8px] font-semibold text-brand-blue-dark">
                      {inicialesDe(s.asignadoA.name)}
                    </span>
                    {s.asignadoA.name}
                  </span>
                ) : (
                  <span className="italic text-slate-400">Sin asignar</span>
                )}
                {s.gestionadoPor && (
                  <span className="ml-auto text-slate-400">Última gestión: {s.gestionadoPor}</span>
                )}
              </div>

              {s.estadoObservaciones && (
                <p className="mt-2 whitespace-pre-line rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                  <span className="font-medium text-slate-500">Observación: </span>
                  {s.estadoObservaciones}
                </p>
              )}

              {s.documentos.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Documentos
                  </p>
                  <ul className="space-y-1">
                    {s.documentos.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                      >
                        <Paperclip className="h-3 w-3 text-slate-400" />
                        <span className="flex-1 truncate">{d.nombre}</span>
                        <span className="text-[10px] text-slate-500">
                          {d.accionadaPor === 'SOPORTE'
                            ? 'Soporte'
                            : d.accionadaPor === 'BOT'
                              ? 'Bot'
                              : 'Aliado'}
                        </span>
                        {d.eliminado ? (
                          <span className="text-[10px] italic text-slate-400">
                            Eliminado (retención)
                          </span>
                        ) : (
                          <a
                            href={`/api/soporte-af/${s.id}/documentos/${d.id}`}
                            className="inline-flex items-center gap-0.5 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Download className="h-2.5 w-2.5" />
                            Descargar
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {s.gestiones.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wider text-slate-500 hover:text-slate-700">
                    <History className="mr-1 inline h-3 w-3" />
                    Bitácora ({s.gestiones.length})
                  </summary>
                  <ol className="mt-1 space-y-1.5 border-l-2 border-slate-100 pl-3">
                    {s.gestiones.map((g) => (
                      <li key={g.id} className="text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                              g.accionadaPor === 'BOT'
                                ? 'bg-emerald-50 text-emerald-700'
                                : g.accionadaPor === 'SOPORTE'
                                  ? 'bg-brand-blue/10 text-brand-blue-dark'
                                  : 'bg-violet-50 text-violet-700',
                            )}
                          >
                            {g.accionadaPor === 'BOT' ? 'Bot' : g.accionadaPor}
                          </span>
                          {g.nuevoEstado && (
                            <span className="text-[10px] text-slate-500">
                              → {ESTADO_LABEL[g.nuevoEstado]}
                            </span>
                          )}
                          <span className="ml-auto text-[10px] text-slate-400">
                            {fmtDateTime(g.fecha)}
                          </span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-line text-slate-700">{g.descripcion}</p>
                        {g.userName && (
                          <p className="text-[10px] text-slate-500">por {g.userName}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
