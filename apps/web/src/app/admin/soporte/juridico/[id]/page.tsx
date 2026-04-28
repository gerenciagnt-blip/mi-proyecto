import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Scale,
  Download,
  Lock,
  LifeBuoy,
  Building2,
  Clock3,
  FileX,
  Paperclip,
} from 'lucide-react';
import type { IncapacidadAccionadaPor } from '@pila/db';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import {
  TIPO_LABEL,
  DOC_TIPO_LABEL,
  ESTADO_LABEL,
  ESTADO_TONE,
} from '@/lib/incapacidades/validations';
import { requireStaff } from '@/lib/auth-helpers';
import { auth } from '@/auth';
import { puedeDescargarDocConfidencial } from '@/lib/permisos-runtime';
import { GestionJuridicoButton } from './gestion-juridico-button';
import { SubirDocumentoJuridicoButton } from './subir-documento-juridico-button';

export const metadata = { title: 'Caso jurídico · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function JuridicoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const session = await auth();
  if (!session?.user) notFound();

  const { id } = await params;

  const [inc, puedeConfidencial] = await Promise.all([
    prisma.incapacidad.findUnique({
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
    }),
    puedeDescargarDocConfidencial({
      id: session.user.id,
      role: session.user.role,
      rolCustomId: session.user.rolCustomId,
    }),
  ]);
  if (!inc) notFound();

  // Sanity check: si el caso NO está en flujo jurídico, redirigimos a la
  // bandeja de soporte regular. Evita que alguien acceda a /juridico/[id]
  // de un caso que ya cerró o nunca pasó por aquí.
  if (inc.estado !== 'TRASLADO_A_JURIDICO' && inc.estado !== 'EN_PROCESO_JURIDICO') {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/soporte/juridico"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3 w-3" />
          Volver a la bandeja jurídico
        </Link>
        <Alert variant="info">
          <p>
            Este caso (<strong>{inc.consecutivo}</strong>) ya no está en flujo jurídico (estado:{' '}
            <strong>{ESTADO_LABEL[inc.estado]}</strong>). Para verlo, ingresá desde{' '}
            <Link
              href={`/admin/soporte/incapacidades/${inc.id}`}
              className="font-medium text-brand-blue hover:underline"
            >
              Soporte / Incapacidades
            </Link>
            .
          </p>
        </Alert>
      </div>
    );
  }

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
          href="/admin/soporte/juridico"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3 w-3" />
          Volver a la bandeja jurídico
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-indigo-600" />
            <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
              {inc.consecutivo}
            </h1>
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                ESTADO_TONE[inc.estado],
              )}
            >
              {ESTADO_LABEL[inc.estado]}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {nombre} · {inc.cotizante.tipoDocumento} {inc.cotizante.numeroDocumento}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeConfidencial && <SubirDocumentoJuridicoButton incapacidadId={inc.id} />}
          <GestionJuridicoButton
            incapacidadId={inc.id}
            estadoActual={inc.estado}
            consecutivo={inc.consecutivo}
          />
        </div>
      </header>

      {!puedeConfidencial && (
        <Alert variant="info">
          <Lock className="h-4 w-4 shrink-0" />
          <p className="text-xs">
            Tu rol no incluye permiso jurídico — podés ver el caso y registrar gestiones, pero los
            documentos confidenciales no son descargables y no podés adjuntar nuevos. Pedí al
            administrador asignar el rol &laquo;Soporte Jurídico&raquo; si lo necesitás.
          </p>
        </Alert>
      )}

      {/* Info del caso */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InfoCard label="Sucursal">
          <span className="font-mono">{inc.sucursal.codigo}</span> · {inc.sucursal.nombre}
        </InfoCard>
        <InfoCard label="Empresa planilla">
          {inc.empresaPlanilla?.nombre ?? '—'}{' '}
          {inc.empresaPlanilla && (
            <span className="text-xs text-slate-500">(NIT {inc.empresaPlanilla.nit})</span>
          )}
        </InfoCard>
        <InfoCard label="Tipo de incapacidad">{TIPO_LABEL[inc.tipo]}</InfoCard>
        <InfoCard label="Días">{inc.diasIncapacidad}</InfoCard>
        <InfoCard label="Fecha radicación">
          {inc.fechaRadicacion.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </InfoCard>
        <InfoCard label="Periodo de incapacidad">
          {inc.fechaInicio.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} —{' '}
          {inc.fechaFin.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </InfoCard>
        <InfoCard label="EPS">{inc.eps?.nombre ?? '—'}</InfoCard>
        <InfoCard label="ARL">{inc.arl?.nombre ?? '—'}</InfoCard>
      </section>

      {/* Documentos */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Documentos del expediente ({inc.documentos.length})
          </h2>
        </header>
        {inc.documentos.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            Aún no hay documentos en este expediente.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {inc.documentos.map((d) => {
              const eliminado = d.eliminado;
              const confidencial = d.confidencial;
              const puedeDescargar = !eliminado && (!confidencial || puedeConfidencial);
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate text-sm font-medium text-slate-900">
                        {d.archivoNombreOriginal}
                      </span>
                      {confidencial && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                          <Lock className="h-3 w-3" />
                          Confidencial
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                      <span>{DOC_TIPO_LABEL[d.tipo]}</span>
                      <span>·</span>
                      <span>{(d.archivoSize / 1024).toFixed(0)} KB</span>
                      <span>·</span>
                      <span className="capitalize">{d.accionadaPor.toLowerCase()}</span>
                      <span>·</span>
                      <span>
                        {d.createdAt.toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {eliminado ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <FileX className="h-3 w-3" /> Archivado
                      </span>
                    ) : puedeDescargar ? (
                      <a
                        href={`/api/incapacidades/${inc.id}/documentos/${d.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <Download className="h-3 w-3" />
                        Descargar
                      </a>
                    ) : (
                      <span
                        className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-400"
                        title="Documento confidencial — solo área jurídica puede descargarlo"
                      >
                        <Lock className="h-3 w-3" />
                        Restringido
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Bitácora de gestiones */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Bitácora ({inc.gestiones.length} gestiones)
          </h2>
        </header>
        {inc.gestiones.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            Aún no hay gestiones registradas en este caso.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {inc.gestiones.map((g) => (
              <GestionRow key={g.id} g={g} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{children}</p>
    </div>
  );
}

function GestionRow({
  g,
}: {
  g: {
    id: string;
    accionadaPor: IncapacidadAccionadaPor;
    nuevoEstado: string | null;
    descripcion: string;
    userName: string | null;
    createdAt: Date;
  };
}) {
  let tone: string;
  let icon: React.ReactNode;
  let label: string;
  switch (g.accionadaPor) {
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
    case 'JURIDICO':
      tone = 'bg-indigo-50 text-indigo-700 ring-indigo-200';
      icon = <Scale className="h-3 w-3" />;
      label = 'Jurídico';
      break;
    default: {
      const _exhaustive: never = g.accionadaPor;
      void _exhaustive;
      tone = 'bg-slate-100 text-slate-600 ring-slate-200';
      icon = null;
      label = String(g.accionadaPor);
    }
  }
  return (
    <li className="flex gap-3 px-4 py-3">
      <span
        className={cn(
          'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-medium ring-1 ring-inset',
          tone,
        )}
      >
        {icon}
        {label}
      </span>
      <div className="flex-1">
        <p className="text-sm text-slate-700">{g.descripcion}</p>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
          <Clock3 className="h-3 w-3" />
          {g.createdAt.toLocaleString('es-CO')}
          {g.userName && <> · {g.userName}</>}
          {g.nuevoEstado && <> · → {g.nuevoEstado.replaceAll('_', ' ').toLowerCase()}</>}
        </p>
      </div>
    </li>
  );
}
