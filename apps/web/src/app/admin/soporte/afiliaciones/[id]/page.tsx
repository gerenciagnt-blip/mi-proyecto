import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  FileCheck,
  User as UserIcon,
  Building2,
  Paperclip,
  Download,
  History,
  AlertTriangle,
} from 'lucide-react';
import type { SoporteAfEstado, SoporteAfTipoDisparo } from '@pila/db';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { requireStaff } from '@/lib/auth-helpers';
import { formatCOP } from '@/lib/format';
import { resolverCambios } from '@/lib/soporte-af/cambios';
import { GestionForm } from './gestion-form';

export const metadata = { title: 'Solicitud Soporte · Afiliaciones' };
export const dynamic = 'force-dynamic';

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
  REACTIVACION: 'Reactivación (inactiva → activa)',
  CAMBIO_FECHA_INGRESO: 'Cambio fecha ingreso',
  CAMBIO_EMPRESA: 'Cambio empresa',
  CAMBIO_NIVEL_ARL: 'Cambio nivel ARL',
  CAMBIO_PLAN_SGSS: 'Cambio plan SGSS',
};

function DataRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-xs">
      <dt className="col-span-1 text-slate-500">{label}</dt>
      <dd className="col-span-2 font-medium text-slate-900">{value || '—'}</dd>
    </div>
  );
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return '—';
  return d.toLocaleDateString('es-CO');
}

function fmtDateTime(d: Date) {
  return `${d.toLocaleDateString('es-CO')} · ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
}

export default async function SolicitudSoporteAfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;

  const sol = await prisma.soporteAfiliacion.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      gestionadoPor: { select: { id: true, name: true } },
      sucursal: { select: { codigo: true, nombre: true } },
      periodo: { select: { anio: true, mes: true } },
      afiliacion: {
        include: {
          cotizante: {
            include: {
              departamento: { select: { nombre: true } },
              municipio: { select: { nombre: true } },
            },
          },
          empresa: { select: { nit: true, nombre: true } },
          tipoCotizante: { select: { codigo: true, nombre: true } },
          subtipo: { select: { codigo: true, nombre: true } },
          planSgss: { select: { codigo: true, nombre: true } },
          actividadEconomica: { select: { codigoCiiu: true, descripcion: true } },
          asesorComercial: { select: { codigo: true, nombre: true } },
          cuentaCobro: { select: { codigo: true, razonSocial: true } },
          eps: { select: { codigo: true, nombre: true } },
          afp: { select: { codigo: true, nombre: true } },
          arl: { select: { codigo: true, nombre: true } },
          ccf: { select: { codigo: true, nombre: true } },
        },
      },
      documentos: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
      },
      gestiones: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!sol) notFound();

  const cambios = await resolverCambios(
    sol.snapshotAntes as Record<string, unknown> | null,
    sol.snapshotDespues as Record<string, unknown> | null,
  );

  const af = sol.afiliacion;
  const cot = af.cotizante;
  const nombreCompleto = [
    cot.primerNombre,
    cot.segundoNombre,
    cot.primerApellido,
    cot.segundoApellido,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/soporte/afiliaciones"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3 w-3" /> Bandeja soporte
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <FileCheck className="h-6 w-6 text-brand-blue" />
            <span className="font-mono text-xl">{sol.consecutivo}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Recibido {fmtDateTime(sol.fechaRadicacion)} · Aliado{' '}
            <span className="font-medium text-slate-700">
              {sol.createdBy?.name ?? '—'}
            </span>
            {sol.sucursal?.codigo && (
              <>
                {' '}
                ·{' '}
                <span className="font-mono text-[11px]">
                  {sol.sucursal.codigo}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              'inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
              ESTADO_TONE[sol.estado],
            )}
          >
            {ESTADO_LABEL[sol.estado]}
          </span>
          <div className="flex flex-wrap gap-1">
            {sol.disparos.map((d) => (
              <span
                key={d}
                className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
              >
                {DISPARO_LABEL[d]}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Columna izquierda — datos */}
        <div className="space-y-5 lg:col-span-2">
          {/* Cotizante */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <UserIcon className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">
                Cotizante
              </h2>
              <Link
                href={`/admin/base-datos?q=${encodeURIComponent(cot.numeroDocumento)}`}
                className="ml-auto text-[10px] text-brand-blue hover:underline"
              >
                Ver en Base de Datos →
              </Link>
            </header>
            <dl className="divide-y divide-slate-100 px-5 py-2">
              <DataRow label="Documento" value={`${cot.tipoDocumento} ${cot.numeroDocumento}`} />
              <DataRow label="Nombre" value={nombreCompleto} />
              <DataRow label="Fecha nacimiento" value={fmtDate(cot.fechaNacimiento)} />
              <DataRow label="Género" value={cot.genero} />
              <DataRow label="Teléfono" value={cot.telefono || cot.celular} />
              <DataRow label="Email" value={cot.email} />
              <DataRow
                label="Ubicación"
                value={
                  [cot.municipio?.nombre, cot.departamento?.nombre]
                    .filter(Boolean)
                    .join(', ') || '—'
                }
              />
              <DataRow label="Dirección" value={cot.direccion} />
            </dl>
          </section>

          {/* Afiliación */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <Building2 className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">
                Afiliación
              </h2>
              <span
                className={cn(
                  'ml-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                  af.estado === 'ACTIVA'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-slate-100 text-slate-600 ring-slate-200',
                )}
              >
                {af.estado}
              </span>
            </header>
            <dl className="divide-y divide-slate-100 px-5 py-2">
              <DataRow
                label="Modalidad"
                value={af.modalidad === 'DEPENDIENTE' ? 'Dependiente' : 'Independiente'}
              />
              <DataRow
                label="Empresa planilla"
                value={
                  af.empresa
                    ? `${af.empresa.nombre} (NIT ${af.empresa.nit})`
                    : '—'
                }
              />
              <DataRow
                label="Tipo / Subtipo"
                value={
                  [
                    af.tipoCotizante
                      ? `${af.tipoCotizante.codigo} · ${af.tipoCotizante.nombre}`
                      : null,
                    af.subtipo
                      ? `${af.subtipo.codigo} · ${af.subtipo.nombre}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' / ') || '—'
                }
              />
              <DataRow
                label="Plan SGSS"
                value={
                  af.planSgss
                    ? `${af.planSgss.codigo} · ${af.planSgss.nombre}`
                    : '—'
                }
              />
              <DataRow label="Régimen" value={af.regimen} />
              <DataRow label="Nivel ARL" value={af.nivelRiesgo} />
              <DataRow label="Fecha ingreso" value={fmtDate(af.fechaIngreso)} />
              <DataRow label="Fecha retiro" value={fmtDate(af.fechaRetiro)} />
              <DataRow
                label="Salario / Admón"
                value={`${formatCOP(Number(af.salario))}  ·  ${formatCOP(Number(af.valorAdministracion))}`}
              />
              <DataRow label="Forma de pago" value={af.formaPago} />
              <DataRow
                label="EPS / AFP / ARL / CCF"
                value={
                  [
                    af.eps?.nombre,
                    af.afp?.nombre,
                    af.arl?.nombre,
                    af.ccf?.nombre,
                  ]
                    .map((x) => x ?? '—')
                    .join(' · ')
                }
              />
              <DataRow
                label="Actividad económica"
                value={
                  af.actividadEconomica
                    ? `${af.actividadEconomica.codigoCiiu} · ${af.actividadEconomica.descripcion}`
                    : '—'
                }
              />
              <DataRow
                label="Cuenta de cobro"
                value={
                  af.cuentaCobro
                    ? `${af.cuentaCobro.codigo} · ${af.cuentaCobro.razonSocial}`
                    : '—'
                }
              />
              <DataRow
                label="Asesor comercial"
                value={
                  af.asesorComercial
                    ? `${af.asesorComercial.codigo} · ${af.asesorComercial.nombre}`
                    : '—'
                }
              />
              <DataRow label="Comentarios" value={af.comentarios} />
            </dl>
          </section>

          {/* Comparativa cambios (si hay) */}
          {cambios.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/40 shadow-sm">
              <header className="flex items-center gap-2 border-b border-amber-200/70 px-5 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-amber-800">
                  Cambios detectados
                </h2>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-amber-100/60 text-left text-[10px] uppercase tracking-wider text-amber-700">
                    <tr>
                      <th className="px-5 py-2">Campo</th>
                      <th className="px-5 py-2">Antes</th>
                      <th className="px-5 py-2">Después</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {cambios.map((c) => (
                      <tr key={c.campo}>
                        <td className="px-5 py-2 font-medium text-amber-900">
                          {c.label}
                        </td>
                        <td className="px-5 py-2 text-slate-600 line-through">
                          {c.antes}
                        </td>
                        <td className="px-5 py-2 font-semibold text-slate-900">
                          {c.despues}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Documentos */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <Paperclip className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">
                Documentos ({sol.documentos.length})
              </h2>
            </header>
            {sol.documentos.length === 0 ? (
              <p className="px-5 py-4 text-xs text-slate-500">
                Sin documentos adjuntos.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {sol.documentos.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-3 px-5 py-2.5 text-xs"
                  >
                    <Paperclip className="h-3 w-3 text-slate-400" />
                    <div className="flex-1 truncate">
                      <p className="font-medium">{d.archivoNombreOriginal}</p>
                      <p className="text-[10px] text-slate-500">
                        {d.accionadaPor === 'SOPORTE' ? 'Soporte' : 'Aliado'}
                        {' · '}
                        {d.user?.name ?? '—'}
                        {' · '}
                        {(d.archivoSize / 1024).toFixed(0)} KB
                        {' · '}
                        {d.createdAt.toLocaleDateString('es-CO')}
                      </p>
                    </div>
                    {d.eliminado ? (
                      <span className="text-[10px] text-slate-400">
                        Archivo eliminado (retención 120d)
                      </span>
                    ) : (
                      <a
                        href={`/api/soporte-af/${sol.id}/documentos/${d.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                        title="Descargar"
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

          {/* Bitácora */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <History className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">
                Bitácora ({sol.gestiones.length})
              </h2>
            </header>
            {sol.gestiones.length === 0 ? (
              <p className="px-5 py-4 text-xs text-slate-500">
                Sin gestiones registradas todavía.
              </p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {sol.gestiones.map((g) => (
                  <li key={g.id} className="px-5 py-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                          g.accionadaPor === 'SOPORTE'
                            ? 'bg-brand-blue/10 text-brand-blue-dark'
                            : 'bg-violet-50 text-violet-700',
                        )}
                      >
                        {g.accionadaPor}
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
                        {fmtDateTime(g.createdAt)} · {g.userName ?? '—'}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-slate-700">
                      {g.descripcion}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Columna derecha — formulario de gestión */}
        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Gestionar solicitud
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Cambia el estado, registra una observación y adjunta soportes si es necesario.
              </p>
            </header>
            <div className="px-5 py-4">
              <GestionForm
                soporteAfId={sol.id}
                estadoActual={sol.estado}
              />
            </div>
          </section>

          {sol.gestionadoPor && (
            <p className="text-[11px] text-slate-500">
              Última gestión por{' '}
              <span className="font-medium text-slate-700">
                {sol.gestionadoPor.name}
              </span>{' '}
              el {sol.gestionadoEn ? fmtDateTime(sol.gestionadoEn) : '—'}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
