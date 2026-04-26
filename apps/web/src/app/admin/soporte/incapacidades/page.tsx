import Link from 'next/link';
import { HeartPulse, Paperclip, AlertCircle } from 'lucide-react';
import type { IncapacidadEstado, Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { TIPO_LABEL } from '@/lib/incapacidades/validations';
import { DiasIncapacidadChip } from '@/components/admin/dias-incapacidad-chip';

export const metadata = { title: 'Incapacidades · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = {
  estado?: string;
  q?: string;
  tipo?: string;
  sucursalId?: string;
};

const ESTADO_LABEL: Record<IncapacidadEstado, string> = {
  RADICADA: 'Radicada',
  EN_REVISION: 'En revisión',
  APROBADA: 'Aprobada',
  PAGADA: 'Pagada',
  RECHAZADA: 'Rechazada',
};
const ESTADO_TONE: Record<IncapacidadEstado, string> = {
  RADICADA: 'bg-sky-50 text-sky-700 ring-sky-200',
  EN_REVISION: 'bg-amber-50 text-amber-700 ring-amber-200',
  APROBADA: 'bg-violet-50 text-violet-700 ring-violet-200',
  PAGADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RECHAZADA: 'bg-red-50 text-red-700 ring-red-200',
};

export default async function SoporteIncapacidadesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const estadoFilter: IncapacidadEstado | undefined =
    sp.estado === 'RADICADA' ||
    sp.estado === 'EN_REVISION' ||
    sp.estado === 'APROBADA' ||
    sp.estado === 'PAGADA' ||
    sp.estado === 'RECHAZADA'
      ? (sp.estado as IncapacidadEstado)
      : undefined;
  const tipoFilter = sp.tipo && sp.tipo !== '' ? sp.tipo : undefined;
  const sucursalIdFilter = sp.sucursalId?.trim() ?? '';
  const q = sp.q?.trim() ?? '';

  const where: Prisma.IncapacidadWhereInput = {};
  if (estadoFilter) where.estado = estadoFilter;
  if (tipoFilter) {
    where.tipo = tipoFilter as Prisma.IncapacidadWhereInput['tipo'];
  }
  if (sucursalIdFilter) where.sucursalId = sucursalIdFilter;
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

  const [incapacidades, statsByEstado, sucursales] = await Promise.all([
    prisma.incapacidad.findMany({
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
        sucursal: { select: { codigo: true, nombre: true } },
        _count: { select: { documentos: true, gestiones: true } },
        // Última gestión que llevó a un estado terminal (PAGADA/RECHAZADA).
        // Sirve para calcular la fecha de cierre del caso.
        gestiones: {
          where: { nuevoEstado: { in: ['PAGADA', 'RECHAZADA'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
    prisma.incapacidad.groupBy({
      by: ['estado'],
      _count: { _all: true },
    }),
    prisma.sucursal.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
  ]);

  const counts = new Map<IncapacidadEstado, number>();
  for (const r of statsByEstado) counts.set(r.estado, r._count._all);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <HeartPulse className="h-6 w-6 text-brand-blue" />
          Incapacidades · Soporte
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Radicaciones enviadas por los aliados. Revisa documentos, actualiza el estado y registra
          el pago cuando la entidad responde.
        </p>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(Object.keys(ESTADO_LABEL) as IncapacidadEstado[]).map((e) => (
          <div
            key={e}
            className={cn(
              'rounded-xl border bg-white p-3 shadow-sm',
              e === 'RADICADA' && 'border-sky-200',
              e === 'EN_REVISION' && 'border-amber-200',
              e === 'APROBADA' && 'border-violet-200',
              e === 'PAGADA' && 'border-emerald-200',
              e === 'RECHAZADA' && 'border-red-200',
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
            action="/admin/soporte/incapacidades"
            className="flex flex-wrap items-center gap-2"
          >
            <select
              name="estado"
              defaultValue={estadoFilter ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">Todos los estados</option>
              {(Object.keys(ESTADO_LABEL) as IncapacidadEstado[]).map((e) => (
                <option key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </option>
              ))}
            </select>
            <select
              name="tipo"
              defaultValue={tipoFilter ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">Todos los tipos</option>
              {(Object.keys(TIPO_LABEL) as Array<keyof typeof TIPO_LABEL>).map((k) => (
                <option key={k} value={k}>
                  {TIPO_LABEL[k]}
                </option>
              ))}
            </select>
            <select
              name="sucursalId"
              defaultValue={sucursalIdFilter}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} · {s.nombre}
                </option>
              ))}
            </select>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Consecutivo, documento o nombre…"
              className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            />
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-blue-dark"
            >
              Buscar
            </button>
            {(estadoFilter || tipoFilter || sucursalIdFilter || q) && (
              <Link
                href="/admin/soporte/incapacidades"
                className="h-9 leading-9 text-xs text-slate-500"
              >
                Limpiar
              </Link>
            )}
            <span className="ml-auto text-xs text-slate-500">{incapacidades.length}</span>
          </form>
        </div>

        {incapacidades.length === 0 ? (
          <Alert variant="info" className="m-5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Sin incapacidades con los filtros actuales. Cuando los aliados radiquen aparecerán
              aquí.
            </span>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">Consecutivo</th>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Sucursal</th>
                  <th className="px-4 py-2">Cotizante</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2 text-right">Días</th>
                  <th className="px-4 py-2">Docs</th>
                  <th className="px-4 py-2">Estado</th>
                  <th
                    className="px-4 py-2 text-center"
                    title="Días corridos desde la radicación. El contador se detiene al pasar a PAGADA o RECHAZADA."
                  >
                    Tiempo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incapacidades.map((i) => {
                  const nombre = [
                    i.cotizante.primerNombre,
                    i.cotizante.primerApellido,
                    i.cotizante.segundoApellido,
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs font-semibold">
                        <Link
                          href={`/admin/soporte/incapacidades/${i.id}`}
                          className="text-brand-blue hover:underline"
                        >
                          {i.consecutivo}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-[11px] text-slate-500">
                        {i.fechaRadicacion.toLocaleDateString('es-CO')}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <p className="font-mono text-[10px] font-semibold">{i.sucursal.codigo}</p>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <p className="font-medium">{nombre}</p>
                        <p className="font-mono text-[10px] text-slate-500">
                          {i.cotizante.tipoDocumento} {i.cotizante.numeroDocumento}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-[11px]">{TIPO_LABEL[i.tipo]}</td>
                      <td className="px-4 py-2 font-mono text-[11px] text-slate-500">
                        {i.fechaInicio.toISOString().slice(0, 10)} →{' '}
                        {i.fechaFin.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {i.diasIncapacidad}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-slate-500">
                        <Paperclip className="mr-0.5 inline h-3 w-3" />
                        {i._count.documentos}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                            ESTADO_TONE[i.estado],
                          )}
                        >
                          {ESTADO_LABEL[i.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <DiasIncapacidadChip
                          fechaRadicacion={i.fechaRadicacion}
                          estado={i.estado}
                          fechaCierre={i.gestiones[0]?.createdAt ?? null}
                        />
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
