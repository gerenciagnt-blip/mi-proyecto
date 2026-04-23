import Link from 'next/link';
import { Search } from 'lucide-react';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import {
  getUserScope,
  scopeWhereOpt,
  scopeWhereViaCotizante,
} from '@/lib/sucursal-scope';
import { cargarDuenosPorSucursal } from '@/lib/duenos-sucursal';
import { NuevaAfiliacionButton } from './afiliacion-dialog';
import { AfiliacionesTable, type AfiliacionRow } from './afiliaciones-table';

export const metadata = { title: 'Base de datos — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = {
  estado?: string;
  modalidad?: string;
  q?: string;
};

function buildHref(current: SP, patch: Partial<SP>) {
  const params = new URLSearchParams();
  const merged = { ...current, ...patch };
  if (merged.estado) params.set('estado', merged.estado);
  if (merged.modalidad) params.set('modalidad', merged.modalidad);
  if (merged.q) params.set('q', merged.q);
  const s = params.toString();
  return `/admin/base-datos${s ? '?' + s : ''}`;
}

function dateInput(d: Date | null | undefined) {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

export default async function BaseDatosPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const estadoFilter =
    sp.estado === 'ACTIVA' || sp.estado === 'INACTIVA' ? sp.estado : undefined;
  const modalidadFilter =
    sp.modalidad === 'DEPENDIENTE' || sp.modalidad === 'INDEPENDIENTE'
      ? sp.modalidad
      : undefined;
  const q = sp.q?.trim() ?? '';

  // Scope por sucursal: SUCURSAL sólo ve afiliaciones cuyo cotizante
  // pertenece a su sucursal; STAFF (ADMIN/SOPORTE) ve todo.
  const scope = await getUserScope();
  const scopeOpt = await scopeWhereOpt();
  const cotizanteScopeSolo =
    scope?.tipo === 'SUCURSAL' ? { sucursalId: scope.sucursalId } : {};
  const cuentaCobroScope =
    scope?.tipo === 'SUCURSAL' ? { sucursalId: scope.sucursalId } : {};

  const whereAfiliaciones: Prisma.AfiliacionWhereInput = {};
  if (estadoFilter) whereAfiliaciones.estado = estadoFilter;
  if (modalidadFilter) whereAfiliaciones.modalidad = modalidadFilter;

  // Siempre componer el filtro por cotizante (scope + búsqueda de texto).
  const cotizanteFilters: Prisma.CotizanteWhereInput = { ...cotizanteScopeSolo };
  if (q) {
    cotizanteFilters.OR = [
      { numeroDocumento: { contains: q, mode: 'insensitive' } },
      { primerNombre: { contains: q, mode: 'insensitive' } },
      { segundoNombre: { contains: q, mode: 'insensitive' } },
      { primerApellido: { contains: q, mode: 'insensitive' } },
      { segundoApellido: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (Object.keys(cotizanteFilters).length > 0) {
    whereAfiliaciones.cotizante = cotizanteFilters;
  }

  const [
    afiliaciones,
    activasCount,
    inactivasCount,
    cotizantesCount,
    empresas,
    tiposCotizante,
    departamentos,
    entidades,
    cuentasCobro,
    asesores,
    servicios,
    smlvConfig,
    actividades,
    planes,
  ] = await Promise.all([
    prisma.afiliacion.findMany({
      where: whereAfiliaciones,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        cotizante: true,
        empresa: { select: { nit: true, nombre: true } },
        tipoCotizante: { select: { codigo: true, nombre: true } },
        planSgss: { select: { codigo: true, nombre: true, regimen: true } },
        serviciosAdicionales: { select: { servicioAdicionalId: true } },
        // Último estado en la bandeja Soporte · Afiliaciones (columna Estado Sop.)
        soportes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { estado: true },
        },
      },
    }),
    prisma.afiliacion.count({
      where: {
        estado: 'ACTIVA',
        ...(Object.keys(cotizanteScopeSolo).length > 0
          ? { cotizante: cotizanteScopeSolo }
          : {}),
      },
    }),
    prisma.afiliacion.count({
      where: {
        estado: 'INACTIVA',
        ...(Object.keys(cotizanteScopeSolo).length > 0
          ? { cotizante: cotizanteScopeSolo }
          : {}),
      },
    }),
    prisma.cotizante.count({ where: cotizanteScopeSolo }),
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
    prisma.departamento.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        municipios: {
          orderBy: { nombre: 'asc' },
          select: { id: true, nombre: true },
        },
      },
    }),
    prisma.entidadSgss.findMany({
      where: { active: true },
      orderBy: [{ tipo: 'asc' }, { codigo: 'asc' }],
      select: { id: true, tipo: true, codigo: true, nombre: true },
    }),
    prisma.cuentaCobro.findMany({
      where: { active: true, ...cuentaCobroScope },
      orderBy: [{ sucursal: { codigo: 'asc' } }, { codigo: 'asc' }],
      select: { id: true, codigo: true, razonSocial: true, sucursalId: true },
    }),
    prisma.asesorComercial.findMany({
      where: { active: true, ...scopeOpt },
      orderBy: { nombre: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
    prisma.servicioAdicional.findMany({
      where: { active: true, ...scopeOpt },
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
        regimen: true,
      },
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

  const tiposOpts = tiposCotizante.map((t) => ({
    id: t.id,
    codigo: t.codigo,
    nombre: t.nombre,
    modalidad: t.modalidad,
    subtipos: t.subtipos,
  }));

  const eps = entidades
    .filter((e) => e.tipo === 'EPS')
    .map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre }));
  const afp = entidades
    .filter((e) => e.tipo === 'AFP')
    .map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre }));
  const arl = entidades
    .filter((e) => e.tipo === 'ARL')
    .map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre }));
  const ccf = entidades
    .filter((e) => e.tipo === 'CCF')
    .map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre }));

  const serviciosOpts = servicios.map((s) => ({
    id: s.id,
    codigo: s.codigo,
    nombre: s.nombre,
    precio: Number(s.precio),
  }));

  const departamentosOpts = departamentos.map((d) => ({
    id: d.id,
    nombre: d.nombre,
    municipios: d.municipios,
  }));

  const smlv = smlvConfig ? Number(smlvConfig.valor) : 0;
  const totalCount = activasCount + inactivasCount;

  // Dueño aliado por sucursal — solo visible para staff en la tabla.
  const esStaff = scope?.tipo === 'STAFF';
  const duenosBySuc = esStaff ? await cargarDuenosPorSucursal() : null;

  // Catálogos compartidos (se pasan al trigger create y al modal edit/view)
  const catalogos = {
    empresas: empresaOpts,
    tipos: tiposOpts,
    departamentos: departamentosOpts,
    actividades,
    planes,
    eps,
    afp,
    arl,
    ccf,
    cuentasCobro,
    asesores,
    servicios: serviciosOpts,
    smlv,
  };

  // Filas de la tabla (con initial completo para rehidratar el modal)
  const rows: AfiliacionRow[] = afiliaciones.map((a) => ({
    id: a.id,
    modalidad: a.modalidad,
    estado: a.estado,
    nivelRiesgo: a.nivelRiesgo,
    salario: Number(a.salario),
    fechaIngreso: dateInput(a.fechaIngreso),
    duenoAliado:
      duenosBySuc && a.cotizante.sucursalId
        ? (duenosBySuc.get(a.cotizante.sucursalId) ?? null)
        : null,
    cotizante: {
      tipoDocumento: a.cotizante.tipoDocumento,
      numeroDocumento: a.cotizante.numeroDocumento,
      primerNombre: a.cotizante.primerNombre,
      segundoNombre: a.cotizante.segundoNombre,
      primerApellido: a.cotizante.primerApellido,
      segundoApellido: a.cotizante.segundoApellido,
    },
    empresa: a.empresa,
    tipoCotizante: a.tipoCotizante,
    plan: a.planSgss
      ? {
          codigo: a.planSgss.codigo,
          nombre: a.planSgss.nombre,
          regimen: a.planSgss.regimen,
        }
      : null,
    regimen: a.regimen,
    estadoSoporte: a.soportes[0]?.estado ?? null,
    initial: {
      modalidad: a.modalidad,
      empresaId: a.empresaId,
      cuentaCobroId: a.cuentaCobroId,
      asesorComercialId: a.asesorComercialId,
      planSgssId: a.planSgssId,
      actividadEconomicaId: a.actividadEconomicaId,
      tipoCotizanteId: a.tipoCotizanteId,
      subtipoId: a.subtipoId,
      nivelRiesgo: a.nivelRiesgo,
      regimen: a.regimen,
      formaPago: a.formaPago,
      estado: a.estado,
      salario: Number(a.salario),
      valorAdministracion: Number(a.valorAdministracion),
      fechaIngreso: dateInput(a.fechaIngreso),
      comentarios: a.comentarios,
      epsId: a.epsId,
      afpId: a.afpId,
      arlId: a.arlId,
      ccfId: a.ccfId,
      serviciosIds: a.serviciosAdicionales.map((s) => s.servicioAdicionalId),
    },
  }));

  const tabs = [
    { label: 'Todas', count: totalCount, href: buildHref(sp, { estado: undefined }) },
    {
      label: 'Activas',
      count: activasCount,
      href: buildHref(sp, { estado: 'ACTIVA' }),
      active: estadoFilter === 'ACTIVA',
    },
    {
      label: 'Inactivas',
      count: inactivasCount,
      href: buildHref(sp, { estado: 'INACTIVA' }),
      active: estadoFilter === 'INACTIVA',
    },
  ];
  const todasActive = !estadoFilter;

  const modalidadChips: { label: string; value: SP['modalidad']; active: boolean }[] = [
    { label: 'Todas', value: undefined, active: !modalidadFilter },
    { label: 'Dependientes', value: 'DEPENDIENTE', active: modalidadFilter === 'DEPENDIENTE' },
    { label: 'Independientes', value: 'INDEPENDIENTE', active: modalidadFilter === 'INDEPENDIENTE' },
  ];

  const emptyMessage =
    q || estadoFilter || modalidadFilter
      ? 'Sin resultados con los filtros actuales'
      : 'Aún no hay afiliaciones — crea la primera con los botones de arriba.';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
            Base de datos
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cotizantes afiliados a las empresas de la plataforma.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NuevaAfiliacionButton modalidad="DEPENDIENTE" {...catalogos} />
          <NuevaAfiliacionButton
            modalidad="INDEPENDIENTE"
            variant="secondary"
            {...catalogos}
          />
        </div>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Cotizantes únicos
          </p>
          <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-900">
            {cotizantesCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Afiliaciones activas
          </p>
          <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-emerald-700">
            {activasCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Inactivas</p>
          <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-500">
            {inactivasCount}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              {/* Tabs estado */}
              <div className="flex gap-1">
                {tabs.map((t, i) => (
                  <Link
                    key={t.label}
                    href={t.href}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition',
                      (i === 0 ? todasActive : t.active)
                        ? 'bg-brand-blue/10 text-brand-blue-dark'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )}
                  >
                    {t.label}{' '}
                    <span className="ml-1 text-xs text-slate-400">({t.count})</span>
                  </Link>
                ))}
              </div>

              {/* Chips modalidad */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Modalidad
                </span>
                {modalidadChips.map((m) => (
                  <Link
                    key={m.label}
                    href={buildHref(sp, { modalidad: m.value })}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition',
                      m.active
                        ? 'bg-brand-blue text-white'
                        : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100',
                    )}
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Search form (GET) */}
            <form method="GET" action="/admin/base-datos" className="flex items-center gap-2">
              {estadoFilter && <input type="hidden" name="estado" value={estadoFilter} />}
              {modalidadFilter && (
                <input type="hidden" name="modalidad" value={modalidadFilter} />
              )}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Buscar por cédula o nombre..."
                  className="h-9 w-full min-w-[220px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
                />
              </div>
              {q && (
                <Link
                  href={buildHref(sp, { q: undefined })}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Limpiar
                </Link>
              )}
            </form>
          </div>
        </div>

        <AfiliacionesTable
          rows={rows}
          emptyMessage={emptyMessage}
          catalogos={catalogos}
          mostrarDueno={esStaff}
        />
      </section>
    </div>
  );
}
