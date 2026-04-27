import Link from 'next/link';
import { Bell, Filter, CheckCheck, Inbox } from 'lucide-react';
import type { NotificacionTipo } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { listarHistorico } from '@/lib/notificaciones';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { MarcarLeidaItem, MarcarTodasButton } from './client-actions';

export const metadata = { title: 'Notificaciones — Sistema PILA' };
export const dynamic = 'force-dynamic';

const TIPO_LABEL: Record<NotificacionTipo, string> = {
  SOPORTE_NUEVA_AFILIACION: 'Nueva afiliación',
  SOPORTE_NUEVA_INCAPACIDAD: 'Nueva incapacidad',
  SOPORTE_RESPUESTA_CARTERA: 'Respuesta cartera',
  SOPORTE_NOTA_INCAPACIDAD: 'Nota en incapacidad',
  ALIADO_CARTERA_ASIGNADA: 'Cartera asignada',
  ALIADO_GESTION_INCAPACIDAD: 'Gestión incapacidad',
};

const TIPO_TONE: Record<NotificacionTipo, string> = {
  SOPORTE_NUEVA_AFILIACION: 'bg-sky-50 text-sky-700 ring-sky-200',
  SOPORTE_NUEVA_INCAPACIDAD: 'bg-violet-50 text-violet-700 ring-violet-200',
  SOPORTE_RESPUESTA_CARTERA: 'bg-amber-50 text-amber-700 ring-amber-200',
  SOPORTE_NOTA_INCAPACIDAD: 'bg-violet-50 text-violet-700 ring-violet-200',
  ALIADO_CARTERA_ASIGNADA: 'bg-orange-50 text-orange-700 ring-orange-200',
  ALIADO_GESTION_INCAPACIDAD: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const TIPOS_ALL: NotificacionTipo[] = [
  'SOPORTE_NUEVA_AFILIACION',
  'SOPORTE_NUEVA_INCAPACIDAD',
  'SOPORTE_RESPUESTA_CARTERA',
  'SOPORTE_NOTA_INCAPACIDAD',
  'ALIADO_CARTERA_ASIGNADA',
  'ALIADO_GESTION_INCAPACIDAD',
];

type SP = {
  tipo?: string;
  estado?: string;
  q?: string;
  desde?: string;
  hasta?: string;
  page?: string;
};

function parseDateIso(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0));
}

/** Tiempo relativo legible. Mismo helper que la campana, copiado para
 * mantener server/client separados. */
function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function NotificacionesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireAuth();
  const sp = await searchParams;

  const tipoFilter = TIPOS_ALL.includes(sp.tipo as NotificacionTipo)
    ? (sp.tipo as NotificacionTipo)
    : undefined;
  const estadoLectura = sp.estado === 'leidas' || sp.estado === 'no_leidas' ? sp.estado : 'todas';
  const q = sp.q?.trim() ?? '';
  const desde = parseDateIso(sp.desde);
  const hasta = parseDateIso(sp.hasta);
  if (hasta) hasta.setUTCHours(23, 59, 59);
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const result = await listarHistorico(
    session.user.id,
    session.user.role,
    session.user.sucursalId ?? null,
    {
      tipo: tipoFilter,
      estadoLectura,
      q: q || undefined,
      desde,
      hasta,
      page,
      pageSize: 25,
    },
  );

  const hayFiltros = !!tipoFilter || estadoLectura !== 'todas' || !!q || !!sp.desde || !!sp.hasta;

  // Construye una URL preservando filtros (cambiando solo `page`).
  function pageHref(p: number): string {
    const qs = new URLSearchParams();
    if (tipoFilter) qs.set('tipo', tipoFilter);
    if (estadoLectura !== 'todas') qs.set('estado', estadoLectura);
    if (q) qs.set('q', q);
    if (sp.desde) qs.set('desde', sp.desde);
    if (sp.hasta) qs.set('hasta', sp.hasta);
    if (p > 1) qs.set('page', String(p));
    const qstr = qs.toString();
    return qstr ? `/admin/notificaciones?${qstr}` : '/admin/notificaciones';
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <Bell className="h-6 w-6 text-brand-blue" />
            Notificaciones
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Histórico completo de avisos del sistema. La campana del header muestra solo las últimas
            20.
          </p>
        </div>
        <MarcarTodasButton />
      </header>

      {/* Filtros */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <Filter className="h-4 w-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">Filtros</span>
          <span className="ml-auto text-[10px] text-slate-500">
            {result.total} resultado{result.total === 1 ? '' : 's'}
          </span>
        </header>
        <form
          method="GET"
          action="/admin/notificaciones"
          className="flex flex-wrap items-end gap-2 px-4 py-3 text-xs"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Tipo</span>
            <select
              name="tipo"
              defaultValue={tipoFilter ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="">Todos</option>
              {TIPOS_ALL.map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Estado</span>
            <select
              name="estado"
              defaultValue={estadoLectura}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="todas">Todas</option>
              <option value="no_leidas">No leídas</option>
              <option value="leidas">Leídas</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Desde</span>
            <input
              type="date"
              name="desde"
              defaultValue={sp.desde ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Hasta</span>
            <input
              type="date"
              name="hasta"
              defaultValue={sp.hasta ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Buscar</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Título o mensaje…"
              className="h-9 min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 text-xs placeholder:text-slate-400"
            />
          </label>
          <button
            type="submit"
            className="h-9 rounded-lg bg-brand-blue px-3 text-xs font-medium text-white hover:bg-brand-blue-dark"
          >
            Aplicar
          </button>
          {hayFiltros && (
            <Link
              href="/admin/notificaciones"
              className="h-9 leading-9 text-xs text-slate-500 underline hover:text-slate-700"
            >
              Limpiar
            </Link>
          )}
        </form>
      </section>

      {/* Lista */}
      {result.items.length === 0 ? (
        <Alert variant="info">
          <Inbox className="h-4 w-4 shrink-0" />
          <span>
            {hayFiltros
              ? 'Sin notificaciones que coincidan con los filtros actuales.'
              : 'Aún no tienes notificaciones. Cuando ocurra algo relevante, aparecerá aquí.'}
          </span>
        </Alert>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {result.items.map((n) => (
              <MarcarLeidaItem key={n.id} id={n.id} href={n.href} leida={n.leida}>
                <div className="flex items-start gap-3 px-5 py-3">
                  <span
                    className={cn(
                      'mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full',
                      n.leida ? 'bg-transparent' : 'bg-brand-blue',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          TIPO_TONE[n.tipo as NotificacionTipo],
                        )}
                      >
                        {TIPO_LABEL[n.tipo as NotificacionTipo] ?? n.tipo}
                      </span>
                      <p
                        className={cn(
                          'text-sm',
                          n.leida ? 'font-medium text-slate-700' : 'font-semibold text-slate-900',
                        )}
                      >
                        {n.titulo}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{n.mensaje}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatRelative(n.createdAt)} · {n.createdAt.toLocaleString('es-CO')}
                    </p>
                  </div>
                </div>
              </MarcarLeidaItem>
            ))}
          </ul>
        </section>
      )}

      {/* Paginación */}
      {result.totalPages > 1 && (
        <nav className="flex items-center justify-between gap-2 text-xs">
          <p className="text-slate-500">
            Página {result.page} de {result.totalPages} · {result.total} en total
          </p>
          <div className="flex gap-1">
            {result.page > 1 ? (
              <Link
                href={pageHref(result.page - 1)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Anterior
              </Link>
            ) : (
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-400">
                Anterior
              </span>
            )}
            {result.page < result.totalPages ? (
              <Link
                href={pageHref(result.page + 1)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Siguiente
              </Link>
            ) : (
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-400">
                Siguiente
              </span>
            )}
          </div>
        </nav>
      )}

      <p className="text-center text-[10px] text-slate-400">
        <CheckCheck className="mr-1 inline h-3 w-3" />
        Click en una notificación: la marca como leída y te lleva al contexto. Las leídas tienen el
        punto azul apagado.
      </p>
    </div>
  );
}
