import { prisma } from '@pila/db';
import { NuevaAfiliacionDialog } from './nueva-afiliacion-dialog';

export const metadata = { title: 'Base de datos — Sistema PILA' };
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

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function fullName(c: {
  primerNombre: string;
  segundoNombre: string | null;
  primerApellido: string;
  segundoApellido: string | null;
}) {
  return [c.primerNombre, c.segundoNombre, c.primerApellido, c.segundoApellido]
    .filter(Boolean)
    .join(' ');
}

export default async function BaseDatosPage() {
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
  ] = await Promise.all([
    prisma.afiliacion.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        cotizante: true,
        empresa: { select: { nit: true, nombre: true } },
        tipoCotizante: { select: { codigo: true, nombre: true } },
      },
    }),
    prisma.afiliacion.count({ where: { estado: 'ACTIVA' } }),
    prisma.afiliacion.count({ where: { estado: 'INACTIVA' } }),
    prisma.cotizante.count(),
    prisma.empresa.findMany({
      where: { active: true },
      orderBy: { nombre: 'asc' },
      include: {
        nivelesPermitidos: { select: { nivel: true } },
        tiposPermitidos: { select: { tipoCotizanteId: true } },
        subtiposPermitidos: { select: { subtipoId: true } },
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
  ]);

  const empresaOpts = empresas.map((e) => ({
    id: e.id,
    nit: e.nit,
    nombre: e.nombre,
    sucursalId: null as string | null,
    niveles: e.nivelesPermitidos.map((n) => n.nivel as string),
    tiposIds: e.tiposPermitidos.map((t) => t.tipoCotizanteId),
    subtiposIds: e.subtiposPermitidos.map((s) => s.subtipoId),
  }));

  const eps = entidades.filter((e) => e.tipo === 'EPS');
  const afp = entidades.filter((e) => e.tipo === 'AFP');
  const ccf = entidades.filter((e) => e.tipo === 'CCF');

  const smlv = smlvConfig ? Number(smlvConfig.valor) : 0;

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
        <NuevaAfiliacionDialog
          empresas={empresaOpts}
          tipos={tiposCotizante.map((t) => ({
            id: t.id,
            codigo: t.codigo,
            nombre: t.nombre,
            subtipos: t.subtipos,
          }))}
          departamentos={departamentos.map((d) => ({
            id: d.id,
            nombre: d.nombre,
            municipios: d.municipios,
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

      {/* Tabla */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">
            Últimas afiliaciones{' '}
            <span className="text-xs font-normal text-slate-500">({afiliaciones.length})</span>
          </p>
          <p className="text-[11px] text-slate-400">
            Mostrando las 200 más recientes. Filtros y búsqueda en Fase 2.2.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Documento</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Empresa</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Nivel</th>
                <th className="px-4 py-2 text-right">Salario</th>
                <th className="px-4 py-2">Ingreso</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {afiliaciones.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Aún no hay afiliaciones — crea la primera con el botón de arriba.
                  </td>
                </tr>
              )}
              {afiliaciones.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-mono text-xs">
                    {DOC_LABELS[a.cotizante.tipoDocumento] ?? a.cotizante.tipoDocumento}{' '}
                    {a.cotizante.numeroDocumento}
                  </td>
                  <td className="px-4 py-3">{fullName(a.cotizante)}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-slate-500">{a.empresa.nit}</p>
                    <p>{a.empresa.nombre}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="font-mono text-slate-500">{a.tipoCotizante.codigo}</span>
                    <span className="ml-2">{a.tipoCotizante.nombre}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{a.nivelRiesgo}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {copFmt.format(Number(a.salario))}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {a.fechaIngreso.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.estado === 'ACTIVA'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {a.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
