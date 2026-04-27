import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  HeartPulse,
  Paperclip,
  Download,
  Trash2,
  LifeBuoy,
  Building2,
  Clock3,
  FileX,
} from 'lucide-react';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import {
  TIPO_LABEL,
  DOC_TIPO_LABEL,
  ESTADO_LABEL,
  ESTADO_TONE,
} from '@/lib/incapacidades/validations';
import { GestionSoporteIncapButton } from './gestion-soporte-button';
import { AnularIncapacidadButton } from './anular-button';

export const metadata = { title: 'Incapacidad · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

// ESTADO_LABEL y ESTADO_TONE ahora viven en lib/incapacidades/validations.ts
// (Sprint Soporte reorg fase 2 — antes estaban duplicados en 4 archivos).

export default async function IncapacidadDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const inc = await prisma.incapacidad.findUnique({
    where: { id },
    include: {
      cotizante: {
        select: {
          tipoDocumento: true,
          numeroDocumento: true,
          primerNombre: true,
          segundoNombre: true,
          primerApellido: true,
          segundoApellido: true,
          email: true,
          celular: true,
        },
      },
      sucursal: { select: { codigo: true, nombre: true } },
      empresaPlanilla: { select: { id: true, nombre: true, nit: true } },
      eps: { select: { nombre: true } },
      afp: { select: { nombre: true } },
      arl: { select: { nombre: true } },
      ccf: { select: { nombre: true } },
      createdBy: { select: { name: true } },
      documentos: { orderBy: { createdAt: 'asc' } },
      gestiones: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!inc) notFound();

  const nombre = [
    inc.cotizante.primerNombre,
    inc.cotizante.segundoNombre,
    inc.cotizante.primerApellido,
    inc.cotizante.segundoApellido,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/soporte/incapacidades"
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Incapacidades</span>
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
              <HeartPulse className="h-6 w-6 text-brand-blue" />
              <span className="font-mono">{inc.consecutivo}</span>
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {TIPO_LABEL[inc.tipo]} · {nombre} · {inc.cotizante.tipoDocumento}{' '}
              {inc.cotizante.numeroDocumento}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <GestionSoporteIncapButton
              incapacidadId={inc.id}
              estadoActual={inc.estado}
              consecutivo={inc.consecutivo}
            />
            <AnularIncapacidadButton incapacidadId={inc.id} consecutivo={inc.consecutivo} />
          </div>
        </div>
      </div>

      {/* Cabecera */}
      <section className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <Field
          label="Estado"
          value={
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                ESTADO_TONE[inc.estado],
              )}
            >
              {ESTADO_LABEL[inc.estado]}
            </span>
          }
        />
        <Field label="Tipo" value={TIPO_LABEL[inc.tipo]} />
        <Field
          label="Período"
          value={`${inc.fechaInicio.toISOString().slice(0, 10)} → ${inc.fechaFin.toISOString().slice(0, 10)}`}
        />
        <Field label="Días" value={String(inc.diasIncapacidad)} highlight />
        <Field label="Sucursal" value={`${inc.sucursal.codigo} · ${inc.sucursal.nombre}`} />
        <Field
          label="Empresa planilla"
          value={inc.empresaPlanilla?.nombre ?? inc.empresaPlanillaNombreSnap ?? '—'}
          sub={inc.empresaPlanilla?.nit ? `NIT ${inc.empresaPlanilla.nit}` : undefined}
        />
        <Field label="EPS" value={inc.eps?.nombre ?? '—'} />
        <Field label="ARL" value={inc.arl?.nombre ?? '—'} />
        <Field label="AFP" value={inc.afp?.nombre ?? '—'} />
        <Field label="CCF" value={inc.ccf?.nombre ?? '—'} />
        <Field
          label="Fecha afiliación"
          value={inc.fechaAfiliacionSnap ? inc.fechaAfiliacionSnap.toISOString().slice(0, 10) : '—'}
        />
        <Field
          label="Radicada por"
          value={inc.createdBy?.name ?? '—'}
          sub={inc.fechaRadicacion.toLocaleString('es-CO')}
        />
        {inc.observaciones && (
          <div className="sm:col-span-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Observaciones
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{inc.observaciones}</p>
          </div>
        )}
      </section>

      {/* Documentos adjuntos */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <h2 className="flex items-center gap-1 text-sm font-semibold text-slate-700">
            <Paperclip className="h-4 w-4" />
            Documentos adjuntos ({inc.documentos.length})
          </h2>
        </header>
        {inc.documentos.length === 0 ? (
          <p className="p-5 text-xs text-slate-400">Esta radicación no tiene documentos.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {inc.documentos.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-lg',
                    d.eliminado ? 'bg-slate-100 text-slate-400' : 'bg-sky-50 text-sky-700',
                  )}
                >
                  {d.eliminado ? <FileX className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-800">{DOC_TIPO_LABEL[d.tipo]}</p>
                  <p className="font-mono text-[10px] text-slate-500">
                    {d.archivoNombreOriginal} · {d.archivoMime} ·{' '}
                    {(d.archivoSize / 1024).toFixed(0)} KB
                  </p>
                  {d.eliminado && (
                    <p className="mt-0.5 text-[10px] font-medium text-amber-700">
                      Archivo eliminado por retención ( {d.eliminadoEn?.toLocaleDateString('es-CO')}
                      ). Queda el registro como evidencia.
                    </p>
                  )}
                </div>
                <span className="font-mono text-[10px] text-slate-400">
                  {d.createdAt.toLocaleDateString('es-CO')}
                </span>
                {!d.eliminado && (
                  <a
                    href={`/api/incapacidades/${inc.id}/documentos/${d.id}`}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    title="Descargar documento"
                  >
                    <Download className="h-3 w-3" />
                    Descargar
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bitácora de gestiones */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <h2 className="flex items-center gap-1 text-sm font-semibold text-slate-700">
            <Clock3 className="h-4 w-4" />
            Bitácora ({inc.gestiones.length})
          </h2>
        </header>
        {inc.gestiones.length === 0 ? (
          <p className="p-5 text-xs text-slate-400">Aún no hay gestiones registradas.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {inc.gestiones.map((g) => (
              <li key={g.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Sprint Soporte reorg fase 2 — switch exhaustivo en lugar
                     de ternario (que pintaba cualquier futuro valor del enum
                     como ALIADO). Hoy son 2 valores; si se agregan BOT/SISTEMA
                     más adelante el TS forzará a actualizar este bloque. */}
                  {(() => {
                    const accionadaPor: typeof g.accionadaPor = g.accionadaPor;
                    let tone: string;
                    let icon: React.ReactNode;
                    let label: string;
                    switch (accionadaPor) {
                      case 'SOPORTE':
                        tone = 'bg-sky-50 text-sky-700 ring-sky-200';
                        icon = <LifeBuoy className="h-3 w-3" />;
                        label = 'Soporte';
                        break;
                      case 'ALIADO':
                        tone = 'bg-brand-blue/10 text-brand-blue-dark ring-brand-blue/20';
                        icon = <Building2 className="h-3 w-3" />;
                        label = 'Aliado';
                        break;
                      default: {
                        // Exhaustiveness check — si se agrega un valor al enum
                        // sin actualizar este switch, TS marca error aquí.
                        const _exhaustive: never = accionadaPor;
                        void _exhaustive;
                        tone = 'bg-slate-100 text-slate-600 ring-slate-200';
                        icon = null;
                        label = String(accionadaPor);
                      }
                    }
                    return (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          tone,
                        )}
                      >
                        {icon}
                        {label}
                      </span>
                    );
                  })()}
                  {g.nuevoEstado && (
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                        ESTADO_TONE[g.nuevoEstado],
                      )}
                    >
                      → {ESTADO_LABEL[g.nuevoEstado]}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-slate-500">
                    {g.createdAt.toLocaleString('es-CO')}
                  </span>
                </div>
                {g.userName && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Por <strong>{g.userName}</strong>
                  </p>
                )}
                <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{g.descripcion}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <div
        className={cn(
          'mt-0.5 font-mono text-sm',
          highlight ? 'font-bold text-brand-blue-dark' : 'text-slate-900',
        )}
      >
        {value}
      </div>
      {sub && <p className="font-mono text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}
