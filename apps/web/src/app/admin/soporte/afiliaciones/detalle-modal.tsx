'use client';

import { useEffect, useState } from 'react';
import {
  User as UserIcon,
  Building2,
  Paperclip,
  Download,
  History,
  AlertTriangle,
  Loader2,
  Bot,
  Shield,
} from 'lucide-react';
import type { SoporteAfEstado, SoporteAfTipoDisparo } from '@pila/db';
import { cn } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { getSoporteAfDetailAction, type DetalleSoporteAf, type StaffAsignable } from './actions';
import { GestionForm } from './[id]/gestion-form';
import { AsignarPopover } from './asignar-popover';
import { arlStatusFromBot } from '@/lib/soporte-af/arl-status';

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
  NUEVA: 'Nueva afiliación',
  REACTIVACION: 'Reactivación',
  CAMBIO_FECHA_INGRESO: 'Cambio fecha ingreso',
  CAMBIO_EMPRESA: 'Cambio empresa',
  CAMBIO_NIVEL_ARL: 'Cambio nivel ARL',
  CAMBIO_PLAN_SGSS: 'Cambio plan SGSS',
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-CO')} · ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmtFecha(iso: string | null) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1 text-xs">
      <dt className="col-span-1 text-slate-500">{label}</dt>
      <dd className="col-span-2 font-medium text-slate-900">{value || '—'}</dd>
    </div>
  );
}

export function DetalleModal({
  soporteAfId,
  open,
  onClose,
  staffAsignables,
}: {
  soporteAfId: string | null;
  open: boolean;
  onClose: () => void;
  staffAsignables: StaffAsignable[];
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DetalleSoporteAf | null>(null);

  useEffect(() => {
    if (!open || !soporteAfId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    getSoporteAfDetailAction(soporteAfId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setData(res.data);
        else setError(res.error);
      })
      .catch(() => {
        if (!cancelled) setError('Error al cargar el detalle');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, soporteAfId]);

  const title = data ? (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm">{data.consecutivo}</span>
      <span
        className={cn(
          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
          ESTADO_TONE[data.estado],
        )}
      >
        {ESTADO_LABEL[data.estado]}
      </span>
    </div>
  ) : (
    'Detalle de solicitud'
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={
        data
          ? `Recibido ${fmtDateTime(data.fechaRadicacion)} · Aliado ${data.creadoPor?.name ?? '—'}${data.sucursal?.codigo ? ` · ${data.sucursal.codigo}` : ''}`
          : 'Cargando…'
      }
      size="xl"
    >
      {loading && (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando detalle…
        </div>
      )}

      {!loading && error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {!loading && data && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Izquierda — 2 columnas */}
          <div className="space-y-4 lg:col-span-2">
            {/* Disparos */}
            <div className="flex flex-wrap gap-1">
              {data.disparos.map((d) => (
                <span
                  key={d}
                  className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                >
                  {DISPARO_LABEL[d]}
                </span>
              ))}
            </div>

            {/* Cotizante */}
            <section className="rounded-lg border border-slate-200 bg-white">
              <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
                <UserIcon className="h-4 w-4 text-slate-500" />
                <h3 className="text-xs font-semibold text-slate-700">Cotizante</h3>
              </header>
              <dl className="divide-y divide-slate-100 px-4 py-1">
                <DataRow
                  label="Documento"
                  value={`${data.cotizante.tipoDocumento} ${data.cotizante.numeroDocumento}`}
                />
                <DataRow label="Nombre" value={data.cotizante.nombreCompleto} />
                <DataRow label="Nacimiento" value={fmtFecha(data.cotizante.fechaNacimiento)} />
                <DataRow label="Género" value={data.cotizante.genero} />
                <DataRow
                  label="Teléfono"
                  value={data.cotizante.telefono || data.cotizante.celular}
                />
                <DataRow label="Email" value={data.cotizante.email} />
                <DataRow label="Ubicación" value={data.cotizante.ubicacion} />
                <DataRow label="Dirección" value={data.cotizante.direccion} />
              </dl>
            </section>

            {/* Afiliación */}
            <section className="rounded-lg border border-slate-200 bg-white">
              <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
                <Building2 className="h-4 w-4 text-slate-500" />
                <h3 className="text-xs font-semibold text-slate-700">Afiliación</h3>
                <span
                  className={cn(
                    'ml-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                    data.afiliacion.estado === 'ACTIVA'
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      : 'bg-slate-100 text-slate-600 ring-slate-200',
                  )}
                >
                  {data.afiliacion.estado}
                </span>
              </header>
              <dl className="divide-y divide-slate-100 px-4 py-1">
                <DataRow label="Modalidad" value={data.afiliacion.modalidad} />
                <DataRow label="Empresa planilla" value={data.afiliacion.empresa} />
                <DataRow label="Tipo / Subtipo" value={data.afiliacion.tipoSubtipo} />
                <DataRow label="Plan SGSS" value={data.afiliacion.plan} />
                <DataRow label="Régimen" value={data.afiliacion.regimen} />
                <DataRow label="Nivel ARL" value={data.afiliacion.nivelArl} />
                <DataRow label="Fecha ingreso" value={fmtFecha(data.afiliacion.fechaIngreso)} />
                <DataRow label="Fecha retiro" value={fmtFecha(data.afiliacion.fechaRetiro)} />
                <DataRow
                  label="Salario / Admón"
                  value={`${data.afiliacion.salarioLabel}  ·  ${data.afiliacion.adminLabel}`}
                />
                <DataRow label="Forma de pago" value={data.afiliacion.formaPago} />
                <DataRow
                  label="EPS / AFP / ARL / CCF"
                  value={[
                    data.afiliacion.eps,
                    data.afiliacion.afp,
                    data.afiliacion.arl,
                    data.afiliacion.ccf,
                  ]
                    .map((x) => x ?? '—')
                    .join(' · ')}
                />
                <DataRow label="Actividad económica" value={data.afiliacion.actividad} />
                <DataRow label="Cuenta de cobro" value={data.afiliacion.cuentaCobro} />
                <DataRow label="Asesor comercial" value={data.afiliacion.asesor} />
                <DataRow label="Comentarios" value={data.afiliacion.comentarios} />
              </dl>
            </section>

            {/* Cambios detectados */}
            {data.cambios.length > 0 && (
              <section className="rounded-lg border border-amber-200 bg-amber-50/40">
                <header className="flex items-center gap-2 border-b border-amber-200/70 px-4 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <h3 className="text-xs font-semibold text-amber-800">Cambios detectados</h3>
                </header>
                <table className="w-full text-xs">
                  <thead className="bg-amber-100/60 text-left text-[10px] uppercase tracking-wider text-amber-700">
                    <tr>
                      <th className="px-4 py-1.5">Campo</th>
                      <th className="px-4 py-1.5">Antes</th>
                      <th className="px-4 py-1.5">Después</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {data.cambios.map((c) => (
                      <tr key={c.campo}>
                        <td className="px-4 py-1.5 font-medium text-amber-900">{c.label}</td>
                        <td className="px-4 py-1.5 text-slate-600 line-through">{c.antes}</td>
                        <td className="px-4 py-1.5 font-semibold text-slate-900">{c.despues}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Documentos */}
            <section className="rounded-lg border border-slate-200 bg-white">
              <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
                <Paperclip className="h-4 w-4 text-slate-500" />
                <h3 className="text-xs font-semibold text-slate-700">
                  Documentos ({data.documentos.length})
                </h3>
              </header>
              {data.documentos.length === 0 ? (
                <p className="px-4 py-2.5 text-xs text-slate-500">Sin documentos adjuntos.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.documentos.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                      <Paperclip className="h-3 w-3 text-slate-400" />
                      <div className="flex-1 truncate">
                        <p className="font-medium">{d.nombre}</p>
                        <p className="text-[10px] text-slate-500">
                          {d.accionadaPor === 'SOPORTE'
                            ? 'Soporte'
                            : d.accionadaPor === 'BOT'
                              ? 'Bot'
                              : 'Aliado'}
                          {' · '}
                          {d.userName ?? '—'}
                          {' · '}
                          {(d.tamano / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      {d.eliminado ? (
                        <span className="text-[10px] italic text-slate-400">
                          Eliminado (retención 120d)
                        </span>
                      ) : (
                        <a
                          href={`/api/soporte-af/${data.id}/documentos/${d.id}`}
                          className="inline-flex items-center gap-0.5 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="h-2.5 w-2.5" />
                          Descargar
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Bitácora */}
            <section className="rounded-lg border border-slate-200 bg-white">
              <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
                <History className="h-4 w-4 text-slate-500" />
                <h3 className="text-xs font-semibold text-slate-700">
                  Bitácora ({data.gestiones.length})
                </h3>
              </header>
              {data.gestiones.length === 0 ? (
                <p className="px-4 py-2.5 text-xs text-slate-500">
                  Sin gestiones registradas todavía.
                </p>
              ) : (
                <ol className="divide-y divide-slate-100">
                  {data.gestiones.map((g) => {
                    const tone =
                      g.accionadaPor === 'BOT'
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                        : g.accionadaPor === 'SOPORTE'
                          ? 'bg-brand-blue/10 text-brand-blue-dark'
                          : 'bg-violet-50 text-violet-700';
                    const label = g.accionadaPor === 'BOT' ? 'Bot Colpatria' : g.accionadaPor;
                    return (
                      <li key={g.id} className="px-4 py-2 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                              tone,
                            )}
                          >
                            {g.accionadaPor === 'BOT' && <Bot className="h-2.5 w-2.5" />}
                            {label}
                          </span>
                          {g.nuevoEstado && (
                            <span
                              className={cn(
                                'inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium ring-1 ring-inset',
                                ESTADO_TONE[g.nuevoEstado],
                              )}
                            >
                              → {ESTADO_LABEL[g.nuevoEstado]}
                            </span>
                          )}
                          <span className="ml-auto text-[10px] text-slate-500">
                            {fmtDateTime(g.fecha)} · {g.userName ?? '—'}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-line text-slate-700">{g.descripcion}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          {/* Derecha — asignación + gestión */}
          <aside className="space-y-3">
            {/* Asignación */}
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-xs font-semibold text-slate-700">Asignación</h3>
              <AsignarPopover
                soporteAfId={data.id}
                actual={data.asignadoA}
                staff={staffAsignables}
                onAfter={(nuevo) =>
                  setData((prev) => (prev ? { ...prev, asignadoA: nuevo } : prev))
                }
              />
              <p className="mt-2 text-[10px] text-slate-500">
                Cualquier ADMIN/SOPORTE puede tomar o reasignar.
              </p>
            </section>

            {/* Bot ARL Colpatria — solo si aplica */}
            {data.arlBot.planIncluyeArl && data.arlBot.empresaColpatriaActivo && (
              <BotArlSection arlBot={data.arlBot} soporteAfId={data.id} />
            )}

            {/* Gestionar */}
            <section className="rounded-lg border border-slate-200 bg-white">
              <header className="border-b border-slate-100 px-4 py-2">
                <h3 className="text-xs font-semibold text-slate-700">Gestionar solicitud</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Cambia el estado, registra la observación y adjunta soportes.
                </p>
              </header>
              <div className="px-4 py-3">
                <GestionForm soporteAfId={data.id} estadoActual={data.estado} />
              </div>
            </section>

            {data.gestionadoPor && (
              <p className="text-[10px] text-slate-500">
                Última gestión por{' '}
                <span className="font-medium text-slate-700">{data.gestionadoPor}</span>
                {data.gestionadoEn && <> el {fmtDateTime(data.gestionadoEn)}</>}
              </p>
            )}
          </aside>
        </div>
      )}
    </Dialog>
  );
}

/**
 * Sprint Soporte reorg — Bloque que muestra el estado del bot Colpatria
 * para la afiliación ARL. Si terminó OK con PDF disponible, ofrece la
 * descarga. Si el archivo fue archivado por retención, muestra un aviso.
 */
function BotArlSection({
  arlBot,
  soporteAfId,
}: {
  arlBot: DetalleSoporteAf['arlBot'];
  soporteAfId: string;
}) {
  const status = arlStatusFromBot({
    planIncluyeArl: arlBot.planIncluyeArl,
    empresaColpatriaActivo: arlBot.empresaColpatriaActivo,
    lastJobStatus: arlBot.lastJob?.status ?? null,
  });
  const job = arlBot.lastJob;
  const archivado = !!job?.pdfArchivedAt;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <Shield className="h-4 w-4 text-emerald-600" />
        <h3 className="text-xs font-semibold text-slate-700">Bot ARL · Colpatria</h3>
        {status && (
          <span
            className={cn(
              'ml-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
              status.tone,
            )}
          >
            {status.label}
          </span>
        )}
      </div>

      {!job ? (
        <p className="text-[11px] text-slate-500">
          Aún no se ha creado un job para esta afiliación.
        </p>
      ) : (
        <div className="space-y-1.5 text-[11px] text-slate-600">
          <p>
            Intento <span className="font-mono">{job.intento}</span>
            {job.finishedAt && <> · Terminado {new Date(job.finishedAt).toLocaleString('es-CO')}</>}
          </p>
          {job.error && (
            <p className="rounded bg-red-50 px-2 py-1 text-[10px] text-red-700">{job.error}</p>
          )}
          {job.status === 'SUCCESS' && job.pdfPath && !archivado && (
            <a
              href={`/api/colpatria/jobs/${job.id}/pdf`}
              target="_blank"
              rel="noopener"
              className="mt-1 inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <Download className="h-3 w-3" />
              Descargar PDF afiliación
            </a>
          )}
          {job.status === 'SUCCESS' && archivado && (
            <p className="text-[10px] italic text-slate-400">
              PDF archivado por retención — solo metadata disponible.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
