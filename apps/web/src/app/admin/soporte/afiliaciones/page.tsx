import Link from 'next/link';
import { FileCheck, AlertCircle, Paperclip } from 'lucide-react';
import type { Prisma, SoporteAfEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Soporte · Afiliaciones — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = {
  estado?: string;
  desde?: string;
  hasta?: string;
  createdById?: string;
  q?: string;
};

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

const DISPARO_LABEL = {
  NUEVA: 'Nueva',
  REACTIVACION: 'Reactivación',
  CAMBIO_FECHA_INGRESO: 'Cambio fecha',
  CAMBIO_EMPRESA: 'Cambio empresa',
  CAMBIO_NIVEL_ARL: 'Cambio nivel ARL',
  CAMBIO_PLAN_SGSS: 'Cambio plan',
} as const;

function fmtDateTime(d: Date) {
  const fecha = d.toLocaleDateString('es-CO');
  const hora = d.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return { fecha, hora };
}

export default async function SoporteAfiliacionesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const estadoFilter: SoporteAfEstado | undefined =
    sp.estado === 'EN_PROCESO' ||
    sp.estado === 'PROCESADA' ||
    sp.estado === 'RECHAZADA' ||
    sp.estado === 'NOVEDAD'
      ? (sp.estado as SoporteAfEstado)
      : undefined;
  const desde = sp.desde?.trim() ?? '';
  const hasta = sp.hasta?.trim() ?? '';
  const createdByFilter = sp.createdById?.trim() ?? '';
  const q = sp.q?.trim() ?? '';

  const where: Prisma.SoporteAfiliacionWhereInput = {};
  if (estadoFilter) where.estado = estadoFilter;
  if (createdByFilter) where.createdById = createdByFilter;
  if (desde || hasta) {
    where.fechaRadicacion = {};
    if (desde) where.fechaRadicacion.gte = new Date(desde + 'T00:00:00');
    if (hasta) where.fechaRadicacion.lte = new Date(hasta + 'T23:59:59');
  }
  if (q) {
    where.OR = [
      { consecutivo: { contains: q, mode: 'insensitive' } },
      {
        cotizante: {
          OR: [
            { numeroDocumento: { contains: q, mode: 'insensitive' } },
            { primerNombre: { contains: q, mode: 'insensitive' } },
            { primerApellido: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  const [solicitudes, statsByEstado, owners] = await Promise.all([
    prisma.soporteAfiliacion.findMany({
      where,
      orderBy: { fechaRadicacion: 'desc' },
      take: 300,
      include: {
        cotizante: {
          select: {
            tipoDocumento: true,
            numeroDocumento: true,
            primerNombre: true,
            primerApellido: true,
            segundoApellido: true,
          },
        },
        createdBy: { select: { id: true, name: true } },
        sucursal: { select: { codigo: true, nombre: true } },
        _count: { select: { documentos: true, gestiones: true } },
      },
    }),
    prisma.soporteAfiliacion.groupBy({
      by: ['estado'],
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { role: 'ALIADO_OWNER', active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, sucursal: { select: { codigo: true } } },
    }),
  ]);

  const counts = new Map<SoporteAfEstado, number>();
  for (const r of statsByEstado) counts.set(r.estado, r._count._all);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <FileCheck className="h-6 w-6 text-brand-blue" />
          Soporte · Afiliaciones
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Solicitudes generadas automáticamente cuando los aliados crean,
          reactivan o modifican afiliaciones activas. Revisa el detalle,
          cambia el estado y registra la gestión.
        </p>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(ESTADO_LABEL) as SoporteAfEstado[]).map((e) => (
          <div
            key={e}
            className={cn(
              'rounded-xl border bg-white p-3 shadow-sm',
              e === 'EN_PROCESO' && 'border-sky-200',
              e === 'PROCESADA' && 'border-emerald-200',
              e === 'RECHAZADA' && 'border-red-200',
              e === 'NOVEDAD' && 'border-amber-200',
            )}
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {ESTADO_LABEL[e]}
            </p>
            <p className="mt-1 font-mono text-xl font-bold tracking-tight text-slate-900">
              {counts.get(e) ?? 0}
            </p>
          </div>
        ))}
      </section>

      {/* Filtros */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form
            method="GET"
            action="/admin/soporte/afiliaciones"
            className="flex flex-wrap items-end gap-2 text-xs"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Desde
              </span>
              <input
                type="date"
                name="desde"
                defaultValue={desde}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Hasta
              </span>
              <input
                type="date"
                name="hasta"
                defaultValue={hasta}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Aliado
              </span>
              <select
                name="createdById"
                defaultValue={createdByFilter}
                className="h-9 min-w-[180px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">Todos los aliados</option>
                {owners.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.sucursal?.codigo ? `[${u.sucursal.codigo}] ` : ''}
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Estado
              </span>
              <select
                name="estado"
                defaultValue={estadoFilter ?? ''}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">Todos</option>
                {(Object.keys(ESTADO_LABEL) as SoporteAfEstado[]).map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_LABEL[e]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Buscar
              </span>
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Consecutivo, documento o nombre…"
                className="h-9 min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 text-xs"
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-xs font-medium text-white hover:bg-brand-blue-dark"
            >
              Aplicar
            </button>
            {(estadoFilter || desde || hasta || createdByFilter || q) && (
              <Link
                href="/admin/soporte/afiliaciones"
                className="h-9 leading-9 text-xs text-slate-500 underline"
              >
                Limpiar
              </Link>
            )}
            <span className="ml-auto self-center text-xs text-slate-500">
              {solicitudes.length} resultados
            </span>
          </form>
        </div>

        {solicitudes.length === 0 ? (
          <Alert variant="info" className="m-5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Sin solicitudes con los filtros actuales. Cuando los aliados
              registren o modifiquen afiliaciones aparecerán aquí.
            </span>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">Consecutivo</th>
                  <th className="px-4 py-2">Recibido</th>
                  <th className="px-4 py-2">Aliado</th>
                  <th className="px-4 py-2">Cotizante</th>
                  <th className="px-4 py-2">Modalidad</th>
                  <th className="px-4 py-2">Plan SGSS</th>
                  <th className="px-4 py-2">Régimen</th>
                  <th className="px-4 py-2">Disparos</th>
                  <th className="px-4 py-2">Docs</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {solicitudes.map((s) => {
                  const nombre = [
                    s.cotizante.primerNombre,
                    s.cotizante.primerApellido,
                    s.cotizante.segundoApellido,
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const { fecha, hora } = fmtDateTime(s.fechaRadicacion);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs font-semibold">
                        <Link
                          href={`/admin/soporte/afiliaciones/${s.id}`}
                          className="text-brand-blue hover:underline"
                        >
                          {s.consecutivo}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-[11px] text-slate-500">
                        <p>{fecha}</p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {hora}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <p className="font-medium text-slate-900">
                          {s.createdBy?.name ?? '—'}
                        </p>
                        {s.sucursal?.codigo && (
                          <p className="font-mono text-[10px] text-slate-500">
                            {s.sucursal.codigo}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <p className="font-medium">{nombre}</p>
                        <p className="font-mono text-[10px] text-slate-500">
                          {s.cotizante.tipoDocumento}{' '}
                          {s.cotizante.numeroDocumento}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-[11px] text-slate-600">
                        {s.modalidadSnap === 'DEPENDIENTE'
                          ? 'Dependiente'
                          : 'Independiente'}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-slate-600">
                        {s.planNombreSnap ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-slate-600">
                        {s.regimenSnap ?? '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {s.disparos.map((d) => (
                            <span
                              key={d}
                              className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-700"
                            >
                              {DISPARO_LABEL[d]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-[11px] text-slate-500">
                        <Paperclip className="mr-0.5 inline h-3 w-3" />
                        {s._count.documentos}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                            ESTADO_TONE[s.estado],
                          )}
                        >
                          {ESTADO_LABEL[s.estado]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
