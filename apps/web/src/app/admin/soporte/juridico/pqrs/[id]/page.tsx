/**
 * Detalle de una PQRS — vista completa con datos del solicitante,
 * documentos adjuntos, respuesta formal (si la hay) y bitácora.
 *
 * Visible a TODO STAFF (ADMIN/SOPORTE).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  FileText,
  User,
  Calendar,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  MessageSquare,
} from 'lucide-react';
import type { PqrsEstado, PqrsTipo } from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { cn } from '@/lib/utils';
import { PQRS_TIPO_LABEL, diasHabilesRestantes } from '@/lib/pqrs/plazos';
import { GestionPqrsButton } from './_components/gestion-pqrs-button';
import { ResponderPqrsButton } from './_components/responder-pqrs-button';
import { SubirDocPqrsButton } from './_components/subir-doc-pqrs-button';

export const metadata = { title: 'Detalle PQRS — Sistema PILA' };
export const dynamic = 'force-dynamic';

const ESTADO_LABEL: Record<PqrsEstado, string> = {
  RECIBIDA: 'Recibida',
  EN_TRAMITE: 'En trámite',
  RESPONDIDA: 'Respondida',
  CERRADA: 'Cerrada',
  RECHAZADA: 'Rechazada',
};

const ESTADO_TONE: Record<PqrsEstado, string> = {
  RECIBIDA: 'bg-sky-50 text-sky-700 ring-sky-200',
  EN_TRAMITE: 'bg-amber-50 text-amber-700 ring-amber-200',
  RESPONDIDA: 'bg-violet-50 text-violet-700 ring-violet-200',
  CERRADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RECHAZADA: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const TIPO_TONE: Record<PqrsTipo, string> = {
  PETICION: 'bg-slate-100 text-slate-700',
  QUEJA: 'bg-amber-100 text-amber-800',
  RECLAMO: 'bg-rose-100 text-rose-800',
  SUGERENCIA: 'bg-sky-100 text-sky-800',
  FELICITACION: 'bg-emerald-100 text-emerald-800',
};

function formatDate(d: Date): string {
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(d: Date): string {
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function PqrsDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const pqrs = await prisma.pqrs.findUnique({
    where: { id },
    include: {
      respondidoBy: { select: { name: true } },
      documentos: {
        where: { eliminado: false },
        orderBy: { createdAt: 'asc' },
      },
      gestiones: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
      },
    },
  });

  if (!pqrs) notFound();

  const tipoLabel = PQRS_TIPO_LABEL[pqrs.tipo];
  const cerrada = pqrs.estado === 'CERRADA' || pqrs.estado === 'RECHAZADA';
  const dias = !cerrada ? diasHabilesRestantes(pqrs.fechaLimite) : null;
  const vencida = dias !== null && dias < 0;
  const urgente = dias !== null && dias >= 0 && dias <= 2;

  const docsSolicitante = pqrs.documentos.filter((d) => d.origen === 'SOLICITANTE');
  const docsAdmin = pqrs.documentos.filter((d) => d.origen === 'ADMIN');

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/soporte/juridico?seccion=pqrs"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a PQRS
        </Link>
      </div>

      {/* Header con consecutivo + estado + acciones */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
              {pqrs.consecutivo}
            </h1>
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                TIPO_TONE[pqrs.tipo],
              )}
            >
              {tipoLabel}
            </span>
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                ESTADO_TONE[pqrs.estado],
              )}
            >
              {ESTADO_LABEL[pqrs.estado]}
            </span>
          </div>
          <p className="text-base font-medium text-slate-800">{pqrs.asunto}</p>
        </div>

        {!cerrada && (
          <div className="flex flex-wrap items-center gap-2">
            <SubirDocPqrsButton pqrsId={pqrs.id} consecutivo={pqrs.consecutivo} />
            <GestionPqrsButton
              pqrsId={pqrs.id}
              estadoActual={pqrs.estado}
              consecutivo={pqrs.consecutivo}
            />
            <ResponderPqrsButton
              pqrsId={pqrs.id}
              consecutivo={pqrs.consecutivo}
              emailSolicitante={pqrs.email}
              yaTieneRespuesta={!!pqrs.respuesta}
            />
          </div>
        )}
      </header>

      {/* Aviso de plazo */}
      {!cerrada && dias !== null && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm',
            vencida
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : urgente
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-slate-50 text-slate-700',
          )}
        >
          <Clock className="h-4 w-4" />
          {vencida ? (
            <span>
              Plazo <strong>vencido hace {Math.abs(dias)} día(s) hábiles</strong> (límite{' '}
              {formatDateOnly(pqrs.fechaLimite)})
            </span>
          ) : (
            <span>
              {dias === 0 ? (
                <strong>Vence hoy</strong>
              ) : (
                <>
                  Quedan <strong>{dias} día(s) hábiles</strong> para responder
                </>
              )}{' '}
              · límite {formatDateOnly(pqrs.fechaLimite)}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna izquierda: solicitante + descripción + respuesta */}
        <div className="space-y-6 lg:col-span-2">
          {/* Datos del solicitante */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <User className="h-4 w-4 text-slate-400" />
                Datos del solicitante
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 px-5 py-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Nombre
                </p>
                <p className="mt-0.5 font-medium text-slate-900">
                  {pqrs.nombres} {pqrs.apellidos ?? ''}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Documento
                </p>
                <p className="mt-0.5 font-mono text-slate-900">
                  {pqrs.tipoDocumento} {pqrs.numeroDocumento}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  <Mail className="mr-1 inline h-3 w-3 align-text-bottom" />
                  Email
                </p>
                <a
                  href={`mailto:${pqrs.email}`}
                  className="mt-0.5 block break-all text-brand-blue hover:underline"
                >
                  {pqrs.email}
                </a>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  <Phone className="mr-1 inline h-3 w-3 align-text-bottom" />
                  Teléfono
                </p>
                <p className="mt-0.5 text-slate-900">{pqrs.telefono}</p>
              </div>
              {pqrs.empresaNombre && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    <Building2 className="mr-1 inline h-3 w-3 align-text-bottom" />
                    Empresa
                  </p>
                  <p className="mt-0.5 text-slate-900">{pqrs.empresaNombre}</p>
                </div>
              )}
            </div>
          </section>

          {/* Descripción */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <MessageSquare className="h-4 w-4 text-slate-400" />
                Descripción de la solicitud
              </h2>
            </div>
            <div className="px-5 py-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {pqrs.descripcion}
              </p>
            </div>
          </section>

          {/* Respuesta formal (si la hay) */}
          {pqrs.respuesta && (
            <section className="rounded-xl border border-violet-200 bg-violet-50/40 shadow-sm">
              <div className="flex items-center justify-between border-b border-violet-100 px-5 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Send className="h-4 w-4 text-violet-600" />
                  Respuesta enviada al solicitante
                </h2>
                {pqrs.respondidaEn && (
                  <span className="text-xs text-slate-600">
                    {formatDate(pqrs.respondidaEn)}
                    {pqrs.respondidoBy?.name && ` · ${pqrs.respondidoBy.name}`}
                  </span>
                )}
              </div>
              <div className="px-5 py-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {pqrs.respuesta}
                </p>
              </div>
            </section>
          )}

          {/* Documentos del solicitante */}
          {docsSolicitante.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Paperclip className="h-4 w-4 text-slate-400" />
                  Documentos del solicitante ({docsSolicitante.length})
                </h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {docsSolicitante.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate text-slate-700">{doc.archivoNombreOriginal}</span>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">
                      {(doc.archivoSize / 1024).toFixed(0)} KB
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Documentos del staff */}
          {docsAdmin.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Paperclip className="h-4 w-4 text-slate-400" />
                  Documentos adjuntos por staff ({docsAdmin.length})
                </h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {docsAdmin.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate text-slate-700">{doc.archivoNombreOriginal}</span>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">
                      {formatDateOnly(doc.createdAt)} · {(doc.archivoSize / 1024).toFixed(0)} KB
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Columna derecha: metadatos + bitácora */}
        <div className="space-y-6">
          {/* Metadatos */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Información del caso</h2>
            </div>
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="flex items-start justify-between px-5 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  <Calendar className="mr-1 inline h-3 w-3 align-text-bottom" />
                  Recibida
                </dt>
                <dd className="text-right text-xs text-slate-700">{formatDate(pqrs.recibidaEn)}</dd>
              </div>
              <div className="flex items-start justify-between px-5 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Plazo legal
                </dt>
                <dd className="text-right text-xs text-slate-700">
                  {formatDateOnly(pqrs.fechaLimite)}
                </dd>
              </div>
              {pqrs.respondidaEn && (
                <div className="flex items-start justify-between px-5 py-2.5">
                  <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Respondida
                  </dt>
                  <dd className="text-right text-xs text-slate-700">
                    {formatDate(pqrs.respondidaEn)}
                  </dd>
                </div>
              )}
              {pqrs.cerradaEn && (
                <div className="flex items-start justify-between px-5 py-2.5">
                  <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Cerrada
                  </dt>
                  <dd className="text-right text-xs text-slate-700">
                    {formatDate(pqrs.cerradaEn)}
                  </dd>
                </div>
              )}
              <div className="flex items-start justify-between px-5 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  <Mail className="mr-1 inline h-3 w-3 align-text-bottom" />
                  Notif. email
                </dt>
                <dd className="text-right text-xs">
                  {pqrs.notificadoEmailEn ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      {formatDateOnly(pqrs.notificadoEmailEn)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <AlertCircle className="h-3 w-3" />
                      Pendiente
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between px-5 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  <Phone className="mr-1 inline h-3 w-3 align-text-bottom" />
                  Notif. WhatsApp
                </dt>
                <dd className="text-right text-xs">
                  {pqrs.notificadoWhatsappEn ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      {formatDateOnly(pqrs.notificadoWhatsappEn)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <AlertCircle className="h-3 w-3" />
                      Pendiente
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {/* Bitácora */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Bitácora ({pqrs.gestiones.length})
              </h2>
            </div>
            {pqrs.gestiones.length === 0 ? (
              <p className="px-5 py-6 text-center text-xs text-slate-500">Sin gestiones aún.</p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {pqrs.gestiones.map((g) => (
                  <li key={g.id} className="px-5 py-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">
                        {g.userName ?? g.user?.name ?? 'Sistema'}
                      </span>
                      <span className="text-slate-500">{formatDate(g.createdAt)}</span>
                    </div>
                    {g.nuevoEstado && (
                      <p className="mt-1">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                            ESTADO_TONE[g.nuevoEstado],
                          )}
                        >
                          → {ESTADO_LABEL[g.nuevoEstado]}
                        </span>
                      </p>
                    )}
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">{g.descripcion}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
