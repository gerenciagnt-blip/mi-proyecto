import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, History } from 'lucide-react';
import { prisma } from '@pila/db';
import { EditAfiliacionForm } from './edit-form';

export const metadata = { title: 'Editar afiliación — Sistema PILA' };
export const dynamic = 'force-dynamic';

const DOC_LABELS: Record<string, string> = {
  CC: 'CC',
  CE: 'CE',
  NIT: 'NIT',
  PAS: 'PAS',
  TI: 'TI',
  RC: 'RC',
  NIP: 'NIP',
};

function dateInput(d: Date | null | undefined) {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

export default async function EditAfiliacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const afiliacion = await prisma.afiliacion.findUnique({
    where: { id },
    include: {
      cotizante: true,
      serviciosAdicionales: { select: { servicioAdicionalId: true } },
    },
  });
  if (!afiliacion) notFound();

  const [
    empresas,
    tiposCotizante,
    entidades,
    cuentasCobro,
    asesores,
    servicios,
    smlvConfig,
    actividades,
    planes,
    auditLogs,
  ] = await Promise.all([
    prisma.empresa.findMany({
      where: { active: true },
      orderBy: { nombre: 'asc' },
      include: {
        nivelesPermitidos: { select: { nivel: true } },
        tiposPermitidos: { select: { tipoCotizanteId: true } },
        subtiposPermitidos: { select: { subtipoId: true } },
        actividadesPermitidas: { select: { actividadEconomicaId: true } },
      },
    }),
    prisma.tipoCotizante.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      include: {
        subtipos: {
          where: { active: true },
          orderBy: { codigo: 'asc' },
          select: { id: true, codigo: true, nombre: true },
        },
      },
    }),
    prisma.entidadSgss.findMany({
      where: { active: true },
      orderBy: [{ tipo: 'asc' }, { codigo: 'asc' }],
      select: { id: true, tipo: true, codigo: true, nombre: true },
    }),
    prisma.cuentaCobro.findMany({
      where: { active: true },
      orderBy: [{ sucursal: { codigo: 'asc' } }, { codigo: 'asc' }],
      select: { id: true, codigo: true, razonSocial: true, sucursalId: true },
    }),
    prisma.asesorComercial.findMany({
      where: { active: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
    prisma.servicioAdicional.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true, precio: true },
    }),
    prisma.smlvConfig.findUnique({ where: { id: 'singleton' } }),
    prisma.actividadEconomica.findMany({
      where: { active: true },
      orderBy: { codigoCiiu: 'asc' },
      select: { id: true, codigoCiiu: true, descripcion: true },
    }),
    prisma.planSgss.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        incluyeEps: true,
        incluyeAfp: true,
        incluyeArl: true,
        incluyeCcf: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { entidad: 'Afiliacion', entidadId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const empresaOpts = empresas.map((e) => ({
    id: e.id,
    nit: e.nit,
    nombre: e.nombre,
    ciiuPrincipal: e.ciiuPrincipal,
    sucursalId: null as string | null,
    niveles: e.nivelesPermitidos.map((n) => n.nivel as string),
    tiposIds: e.tiposPermitidos.map((t) => t.tipoCotizanteId),
    subtiposIds: e.subtiposPermitidos.map((s) => s.subtipoId),
    actividadesIds: e.actividadesPermitidas.map((a) => a.actividadEconomicaId),
  }));

  const eps = entidades.filter((e) => e.tipo === 'EPS');
  const afp = entidades.filter((e) => e.tipo === 'AFP');
  const ccf = entidades.filter((e) => e.tipo === 'CCF');
  const smlv = smlvConfig ? Number(smlvConfig.valor) : 0;

  const initial = {
    empresaId: afiliacion.empresaId,
    cuentaCobroId: afiliacion.cuentaCobroId,
    asesorComercialId: afiliacion.asesorComercialId,
    planSgssId: afiliacion.planSgssId,
    actividadEconomicaId: afiliacion.actividadEconomicaId,
    tipoCotizanteId: afiliacion.tipoCotizanteId,
    subtipoId: afiliacion.subtipoId,
    nivelRiesgo: afiliacion.nivelRiesgo,
    regimen: afiliacion.regimen,
    estado: afiliacion.estado,
    salario: Number(afiliacion.salario),
    valorAdministracion: afiliacion.valorAdministracion
      ? Number(afiliacion.valorAdministracion)
      : null,
    fechaIngreso: dateInput(afiliacion.fechaIngreso),
    comentarios: afiliacion.comentarios,
    epsId: afiliacion.epsId,
    afpId: afiliacion.afpId,
    ccfId: afiliacion.ccfId,
    serviciosIds: afiliacion.serviciosAdicionales.map((s) => s.servicioAdicionalId),
  };

  const fullName = [
    afiliacion.cotizante.primerNombre,
    afiliacion.cotizante.segundoNombre,
    afiliacion.cotizante.primerApellido,
    afiliacion.cotizante.segundoApellido,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <Link
          href="/admin/base-datos"
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Base de datos</span>
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Editar afiliación
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          <span className="font-mono text-xs">
            {DOC_LABELS[afiliacion.cotizante.tipoDocumento] ?? afiliacion.cotizante.tipoDocumento}{' '}
            {afiliacion.cotizante.numeroDocumento}
          </span>
          <span className="ml-2">· {fullName}</span>
        </p>
      </header>

      <EditAfiliacionForm
        afiliacionId={id}
        initial={initial}
        empresas={empresaOpts}
        actividades={actividades}
        planes={planes}
        tipos={tiposCotizante.map((t) => ({
          id: t.id,
          codigo: t.codigo,
          nombre: t.nombre,
          subtipos: t.subtipos,
        }))}
        eps={eps.map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre }))}
        afp={afp.map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre }))}
        ccf={ccf.map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre }))}
        cuentasCobro={cuentasCobro}
        asesores={asesores}
        servicios={servicios.map((s) => ({
          id: s.id,
          codigo: s.codigo,
          nombre: s.nombre,
          precio: Number(s.precio),
        }))}
        smlv={smlv}
      />

      {/* Historial / Bitácora */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wider text-slate-500">
          <History className="h-4 w-4" />
          Historial de cambios
        </h2>
        {auditLogs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Sin movimientos registrados.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {auditLogs.map((log) => (
              <li key={log.id} className="flex items-start gap-3 py-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-[10px] font-semibold text-brand-blue">
                  {log.accion === 'CREAR'
                    ? '+'
                    : log.accion === 'EDITAR'
                      ? '✎'
                      : log.accion === 'TOGGLE'
                        ? '↻'
                        : '·'}
                </div>
                <div className="flex-1 text-sm">
                  <p className="text-slate-700">{log.descripcion ?? log.accion}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {new Date(log.createdAt).toLocaleString('es-CO')}
                    {log.userName && ` · ${log.userName}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    log.accion === 'CREAR'
                      ? 'bg-emerald-100 text-emerald-700'
                      : log.accion === 'EDITAR'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {log.accion}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
