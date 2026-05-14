import Link from 'next/link';
import { Star, MessageSquare, Users, TrendingUp } from 'lucide-react';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';

export const metadata = { title: 'Calificaciones chat — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = {
  desde?: string;
  hasta?: string;
  staff?: string;
  puntaje?: string;
};

function fmtFecha(d: Date): string {
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Sprint Chat · cierre+rating — dashboard de calificaciones que los
 * aliados dejaron al cerrar conversaciones con staff.
 *
 * Filtros:
 *   - rango de fechas (`desde`, `hasta`)
 *   - staff individual (`staff` = userId)
 *   - puntaje (`puntaje` = 1..5)
 *
 * KPIs:
 *   - promedio general del período
 *   - total calificaciones
 *   - distribución por estrellas
 *   - top staff por promedio (cuando aplica)
 */
export default async function CalificacionesChatPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requirePermiso('soporte.calificaciones_chat');
  const sp = await searchParams;

  const desde = sp.desde ? new Date(sp.desde) : undefined;
  const hasta = sp.hasta ? new Date(sp.hasta + 'T23:59:59') : undefined;
  const staffId = sp.staff && sp.staff.trim() ? sp.staff : undefined;
  const puntajeFilter = sp.puntaje ? Number(sp.puntaje) : undefined;
  const puntajeValido =
    puntajeFilter !== undefined && [1, 2, 3, 4, 5].includes(puntajeFilter)
      ? puntajeFilter
      : undefined;

  // Filtro base por fechas y puntaje.
  const whereBase = {
    createdAt: {
      ...(desde ? { gte: desde } : {}),
      ...(hasta ? { lte: hasta } : {}),
    },
    ...(puntajeValido ? { puntaje: puntajeValido } : {}),
  };

  // Si filtramos por staff: solo conversaciones donde ese user es participante.
  const whereConversacion = staffId
    ? { conversacion: { participantes: { some: { userId: staffId } } } }
    : {};

  const where = { ...whereBase, ...whereConversacion };

  const [calificaciones, countTotal, avgAgg, distribucionRaw, staffParticipantes] =
    await Promise.all([
      prisma.conversacionCalificacion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          user: { select: { name: true, email: true, role: true } },
          conversacion: {
            select: {
              id: true,
              tipo: true,
              nombre: true,
              cerradaAt: true,
              cerradaPorInactividad: true,
              participantes: {
                select: {
                  user: { select: { id: true, name: true, role: true } },
                },
              },
            },
          },
        },
      }),
      prisma.conversacionCalificacion.count({ where }),
      prisma.conversacionCalificacion.aggregate({
        where,
        _avg: { puntaje: true },
      }),
      prisma.conversacionCalificacion.groupBy({
        by: ['puntaje'],
        where,
        _count: { _all: true },
      }),
      // Lista de staff que participaron en conversaciones calificadas
      // (para el dropdown de filtro). Limitado a 100 para evitar payload
      // grande si hay muchos staff históricos.
      prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SOPORTE'] },
          conversacionParticipante: {
            some: {
              conversacion: {
                calificaciones: { some: {} },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
        take: 100,
        select: { id: true, name: true, role: true },
      }),
    ]);

  const avgGeneral = avgAgg._avg.puntaje ?? 0;
  // Mapa puntaje → count para mostrar la distribución 1-5.
  const distMap = new Map<number, number>();
  for (const d of distribucionRaw) distMap.set(d.puntaje, d._count._all);
  const distribucion = [1, 2, 3, 4, 5].map((p) => ({
    puntaje: p,
    count: distMap.get(p) ?? 0,
  }));
  const maxCount = Math.max(...distribucion.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <Star className="h-6 w-6 text-amber-500" />
          Calificaciones chat
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Puntajes y comentarios que los aliados dejaron al cerrar conversaciones con el equipo de
          soporte.
        </p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<Star className="h-5 w-5 text-amber-500" />}
          label="Promedio general"
          value={avgGeneral > 0 ? avgGeneral.toFixed(2) : '—'}
          sublabel={avgGeneral > 0 ? `de 5 estrellas` : 'Sin calificaciones'}
        />
        <KpiCard
          icon={<MessageSquare className="h-5 w-5 text-brand-blue" />}
          label="Total calificaciones"
          value={String(countTotal)}
          sublabel={`período actual`}
        />
        <KpiCard
          icon={<Users className="h-5 w-5 text-emerald-600" />}
          label="Staff calificable"
          value={String(staffParticipantes.length)}
          sublabel={`con calificaciones recibidas`}
        />
      </section>

      {/* Distribución */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <TrendingUp className="h-4 w-4" />
          Distribución por estrellas
        </h2>
        <div className="space-y-1.5">
          {distribucion
            .slice()
            .reverse()
            .map((d) => (
              <div key={d.puntaje} className="flex items-center gap-3 text-xs">
                <span className="w-16 shrink-0 font-mono text-slate-600">
                  {'★'.repeat(d.puntaje)}
                  <span className="text-slate-300">{'★'.repeat(5 - d.puntaje)}</span>
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{
                      width: `${(d.count / maxCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-slate-500">{d.count}</span>
              </div>
            ))}
        </div>
      </section>

      {/* Filtros */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium uppercase tracking-wider text-slate-500">Desde</span>
            <input
              type="date"
              name="desde"
              defaultValue={sp.desde ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium uppercase tracking-wider text-slate-500">Hasta</span>
            <input
              type="date"
              name="hasta"
              defaultValue={sp.hasta ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium uppercase tracking-wider text-slate-500">Staff</span>
            <select
              name="staff"
              defaultValue={sp.staff ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              {staffParticipantes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role === 'ADMIN' ? 'Admin' : 'Soporte'})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium uppercase tracking-wider text-slate-500">Puntaje</span>
            <select
              name="puntaje"
              defaultValue={sp.puntaje ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="5">★★★★★ (5)</option>
              <option value="4">★★★★ (4)</option>
              <option value="3">★★★ (3)</option>
              <option value="2">★★ (2)</option>
              <option value="1">★ (1)</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-xs font-medium text-white hover:bg-brand-blue-dark"
            >
              Filtrar
            </button>
            <Link
              href="/admin/soporte/calificaciones-chat"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Limpiar
            </Link>
          </div>
        </form>
      </section>

      {/* Tabla */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Aliado</th>
              <th className="px-4 py-2">Staff que atendió</th>
              <th className="px-4 py-2">Puntaje</th>
              <th className="px-4 py-2">Comentario</th>
              <th className="px-4 py-2">Conversación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {calificaciones.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Sin calificaciones para los filtros actuales.
                </td>
              </tr>
            )}
            {calificaciones.map((c) => {
              const staffEnConv = c.conversacion.participantes
                .filter((p) => p.user.role === 'ADMIN' || p.user.role === 'SOPORTE')
                .map((p) => p.user.name);
              return (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 text-xs text-slate-500">{fmtFecha(c.createdAt)}</td>
                  <td className="px-4 py-2 text-xs">
                    <p className="font-medium">{c.user.name}</p>
                    <p className="text-[10px] text-slate-500">{c.user.role}</p>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {staffEnConv.length > 0 ? (
                      staffEnConv.join(', ')
                    ) : (
                      <span className="italic text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex font-mono text-base" title={`${c.puntaje}/5`}>
                      <span className="text-amber-500">{'★'.repeat(c.puntaje)}</span>
                      <span className="text-slate-300">{'★'.repeat(5 - c.puntaje)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {c.comentario ? (
                      <span title={c.comentario}>
                        {c.comentario.length > 120
                          ? c.comentario.slice(0, 117) + '…'
                          : c.comentario}
                      </span>
                    ) : (
                      <span className="italic text-slate-400">Sin comentario</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    <p>
                      {c.conversacion.tipo === 'GRUPO'
                        ? (c.conversacion.nombre ?? '(Grupo)')
                        : 'DM'}
                    </p>
                    {c.conversacion.cerradaAt && (
                      <p className="text-[10px] text-slate-400">
                        Cerrada {c.conversacion.cerradaPorInactividad ? '(por inactividad)' : ''} —{' '}
                        {fmtFecha(c.conversacion.cerradaAt)}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
          {icon}
        </span>
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <p className="mt-2 font-heading text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{sublabel}</p>
    </div>
  );
}
