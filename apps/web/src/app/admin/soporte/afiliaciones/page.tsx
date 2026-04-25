import Link from 'next/link';
import { FileCheck, AlertCircle, UserCog } from 'lucide-react';
import type { Prisma, SoporteAfEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { SolicitudesTable, type SolicitudRow } from './solicitudes-table';

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

/** Primer día del mes actual (yyyy-MM-dd). */
function defaultDesde(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Hoy (yyyy-MM-dd). */
function defaultHasta(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

  // Rango por defecto: 1er día del mes actual → hoy. Si vienen explícitos
  // en la URL se usan esos (aunque sean strings vacíos → no filtra).
  const desde = sp.desde ?? defaultDesde();
  const hasta = sp.hasta ?? defaultHasta();
  const createdByFilter = sp.createdById?.trim() ?? '';
  const q = sp.q?.trim() ?? '';

  const where: Prisma.SoporteAfiliacionWhereInput = {};
  if (estadoFilter) where.estado = estadoFilter;
  if (createdByFilter) where.createdById = createdByFilter;
  const fechaDesdeD = desde ? new Date(desde + 'T00:00:00') : null;
  const fechaHastaD = hasta ? new Date(hasta + 'T23:59:59') : null;
  if (fechaDesdeD || fechaHastaD) {
    where.fechaRadicacion = {};
    if (fechaDesdeD) where.fechaRadicacion.gte = fechaDesdeD;
    if (fechaHastaD) where.fechaRadicacion.lte = fechaHastaD;
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

  const [solicitudes, statsByEstado, owners, gestionesEnRango] = await Promise.all([
    prisma.soporteAfiliacion.findMany({
      where,
      orderBy: { fechaRadicacion: 'desc' },
      take: 500,
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
        _count: { select: { documentos: true } },
      },
    }),
    prisma.soporteAfiliacion.groupBy({
      by: ['estado'],
      where,
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { role: 'ALIADO_OWNER', active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, sucursal: { select: { codigo: true } } },
    }),
    // Traemos las gestiones SOPORTE crudas en el rango. Después agrupamos
    // en JS quedándonos con la PRIMERA gestión por solicitud — el "dueño"
    // de esa solicitud es el primer usuario que la tocó. Si después otro
    // usuario gestiona la misma solicitud, no se le cuenta (regla de
    // negocio: una gestión por registro).
    prisma.soporteAfGestion.findMany({
      where: {
        accionadaPor: 'SOPORTE',
        userId: { not: null },
        ...(fechaDesdeD || fechaHastaD
          ? {
              createdAt: {
                ...(fechaDesdeD ? { gte: fechaDesdeD } : {}),
                ...(fechaHastaD ? { lte: fechaHastaD } : {}),
              },
            }
          : {}),
      },
      select: {
        userId: true,
        userName: true,
        soporteAfId: true,
        createdAt: true,
      },
      orderBy: [{ soporteAfId: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const counts = new Map<SoporteAfEstado, number>();
  for (const r of statsByEstado) counts.set(r.estado, r._count._all);

  // Reglas:
  //   1. Iteramos las gestiones ya ordenadas por (soporteAfId, createdAt asc).
  //   2. La primera vez que vemos un soporteAfId, ese userId se queda con
  //      el registro. Las gestiones siguientes de ese mismo soporteAfId se
  //      ignoran (sin importar quién las haya hecho).
  //   3. Contamos cuántas solicitudes únicas tocó cada usuario.
  const solicitudesPorUsuario = new Map<
    string,
    { userId: string | null; userName: string; gestiones: number }
  >();
  const solicitudesYaAtribuidas = new Set<string>();
  for (const g of gestionesEnRango) {
    if (!g.userName || solicitudesYaAtribuidas.has(g.soporteAfId)) continue;
    solicitudesYaAtribuidas.add(g.soporteAfId);
    const key = g.userId ?? `name:${g.userName}`;
    const prev = solicitudesPorUsuario.get(key);
    if (prev) {
      prev.gestiones += 1;
    } else {
      solicitudesPorUsuario.set(key, {
        userId: g.userId,
        userName: g.userName,
        gestiones: 1,
      });
    }
  }
  const statsSoporte = Array.from(solicitudesPorUsuario.values()).sort(
    (a, b) => b.gestiones - a.gestiones,
  );
  const totalGestiones = statsSoporte.reduce((s, u) => s + u.gestiones, 0);
  const maxGestiones = statsSoporte[0]?.gestiones ?? 0;

  const rows: SolicitudRow[] = solicitudes.map((s) => {
    const nombre = [
      s.cotizante.primerNombre,
      s.cotizante.primerApellido,
      s.cotizante.segundoApellido,
    ]
      .filter(Boolean)
      .join(' ');
    return {
      id: s.id,
      consecutivo: s.consecutivo,
      fechaRadicacion: s.fechaRadicacion.toISOString(),
      aliadoNombre: s.createdBy?.name ?? null,
      sucursalCodigo: s.sucursal?.codigo ?? null,
      cotizanteNombre: nombre,
      cotizanteDoc: `${s.cotizante.tipoDocumento} ${s.cotizante.numeroDocumento}`,
      modalidadLabel: s.modalidadSnap === 'DEPENDIENTE' ? 'Dependiente' : 'Independiente',
      planLabel: s.planNombreSnap,
      regimenLabel: s.regimenSnap,
      disparos: s.disparos,
      cantidadDocs: s._count.documentos,
      estado: s.estado,
    };
  });

  const hayFiltrosExtra = Boolean(estadoFilter || createdByFilter || q || sp.desde || sp.hasta);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <FileCheck className="h-6 w-6 text-brand-blue" />
          Soporte · Afiliaciones
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Solicitudes generadas automáticamente cuando los aliados crean, reactivan o modifican
          afiliaciones activas. Rango actual:{' '}
          <span className="font-medium text-slate-700">
            {desde || '—'} → {hasta || '—'}
          </span>
        </p>
      </header>

      {/* Stats por estado */}
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

      {/* Stats por usuario soporte (en el rango).
          Regla: una solicitud cuenta una sola vez, atribuida al primer
          usuario que la gestionó. */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <UserCog className="h-4 w-4 text-slate-500" />
          <h2 className="text-xs font-semibold text-slate-700">
            Gestiones por usuario soporte en el rango
          </h2>
          <span
            className="ml-1 cursor-help text-[10px] text-slate-400"
            title="Cada solicitud se cuenta una sola vez y se le atribuye al primer usuario que la gestionó. Las gestiones posteriores no suman."
          >
            ⓘ
          </span>
          <span className="ml-auto flex items-center gap-3 text-[10px] text-slate-500">
            {statsSoporte.length > 0 && (
              <>
                <span>
                  Total{' '}
                  <span className="font-mono font-semibold text-slate-800">{totalGestiones}</span>{' '}
                  gesti{totalGestiones === 1 ? 'ón' : 'ones'}
                </span>
                <span>·</span>
              </>
            )}
            <span>
              {statsSoporte.length === 0
                ? 'Sin gestiones'
                : `${statsSoporte.length} usuario${statsSoporte.length === 1 ? '' : 's'}`}
            </span>
          </span>
        </header>
        {statsSoporte.length === 0 ? (
          <p className="px-4 py-3 text-xs text-slate-500">
            Ningún usuario de soporte ha registrado gestiones en este rango.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {statsSoporte.map((u, idx) => {
              const pct = totalGestiones > 0 ? (u.gestiones / totalGestiones) * 100 : 0;
              const barPct = maxGestiones > 0 ? (u.gestiones / maxGestiones) * 100 : 0;
              const initials = u.userName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0]!.toUpperCase())
                .join('');
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
              return (
                <li
                  key={u.userId ?? u.userName}
                  className="grid grid-cols-[auto_2rem_1fr_auto_auto] items-center gap-3 px-4 py-2.5 text-xs"
                >
                  <span
                    className={cn(
                      'inline-flex h-5 w-7 items-center justify-center rounded-md font-mono text-[10px] font-semibold tabular-nums',
                      idx === 0 && 'bg-amber-100 text-amber-800',
                      idx === 1 && 'bg-slate-200 text-slate-700',
                      idx === 2 && 'bg-orange-100 text-orange-800',
                      idx > 2 && 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {medal ?? `#${idx + 1}`}
                  </span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-blue/10 font-semibold text-brand-blue-dark">
                    {initials || '?'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{u.userName}</p>
                    <div className="mt-1 h-1 w-full max-w-[280px] overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-brand-blue/70"
                        style={{ width: `${barPct.toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                  <span className="font-mono text-[10px] tabular-nums text-slate-500">
                    {pct.toFixed(0)}%
                  </span>
                  <span className="font-mono text-base font-bold tabular-nums text-brand-blue-dark">
                    {u.gestiones}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Filtros + Tabla */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form
            method="GET"
            action="/admin/soporte/afiliaciones"
            className="flex flex-wrap items-end gap-2 text-xs"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Desde</span>
              <input
                type="date"
                name="desde"
                defaultValue={desde}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Hasta</span>
              <input
                type="date"
                name="hasta"
                defaultValue={hasta}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Aliado</span>
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
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Estado</span>
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
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Buscar</span>
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
            {hayFiltrosExtra && (
              <Link
                href="/admin/soporte/afiliaciones"
                className="h-9 leading-9 text-xs text-slate-500 underline"
              >
                Limpiar
              </Link>
            )}
            <span className="ml-auto self-center text-xs text-slate-500">
              {rows.length} resultados
            </span>
          </form>
        </div>

        {rows.length === 0 ? (
          <Alert variant="info" className="m-5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Sin solicitudes con los filtros actuales. Cuando los aliados registren o modifiquen
              afiliaciones aparecerán aquí.
            </span>
          </Alert>
        ) : (
          <SolicitudesTable rows={rows} />
        )}
      </section>
    </div>
  );
}
