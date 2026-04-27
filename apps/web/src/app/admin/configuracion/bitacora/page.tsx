import Link from 'next/link';
import {
  History,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  PlusCircle,
  Pencil,
  Trash2,
  Wrench,
} from 'lucide-react';
import { prisma } from '@pila/db';
import type { Prisma } from '@pila/db';
import { requireRole } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { buildAuditoriaWhere } from '@/lib/auditoria/scope';
import {
  resolverEntidadesEnLote,
  etiquetaEntidad,
  serializarResolver,
} from '@/lib/auditoria/resolver';
import { BitacoraFiltros } from './filtros';
import { DetalleEventoTrigger } from './detalle-modal';

export const metadata = { title: 'Bitácora — Sistema PILA' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  SOPORTE: 'Soporte',
  ALIADO_OWNER: 'Dueño Aliado',
  ALIADO_USER: 'Usuario Aliado',
};

/**
 * Tonos para los chips de acción. Los valores ya en uso (CREAR/EDITAR/
 * ELIMINAR/TOGGLE/LIQUIDAR_ERRORES/etc.) caen al fallback. Los tres
 * principales del wrapper Sprint 6 tienen color propio.
 */
const ACCION_TONE: Record<string, { className: string; icon: typeof PlusCircle }> = {
  CREAR: { className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: PlusCircle },
  EDITAR: { className: 'bg-blue-50 text-blue-700 ring-blue-200', icon: Pencil },
  ELIMINAR: { className: 'bg-rose-50 text-rose-700 ring-rose-200', icon: Trash2 },
};
const ACCION_DEFAULT = { className: 'bg-slate-100 text-slate-700 ring-slate-200', icon: Wrench };

type SP = {
  q?: string;
  entidad?: string;
  accion?: string;
  userId?: string;
  documento?: string;
  desde?: string;
  hasta?: string;
  page?: string;
};

export default async function BitacoraPage({ searchParams }: { searchParams: Promise<SP> }) {
  // Bloqueamos ALIADO_USER — la bitácora es info administrativa.
  await requireRole('ADMIN', 'SOPORTE', 'ALIADO_OWNER');
  const scope = await getUserScope();
  if (!scope) return null;

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  // Parseo de fechas — `desde` arranca a las 00:00; `hasta` termina a las
  // 23:59:59.999 para incluir todo el día seleccionado.
  let desde: Date | undefined;
  let hasta: Date | undefined;
  if (sp.desde) {
    const d = new Date(sp.desde);
    if (!isNaN(d.getTime())) desde = d;
  }
  if (sp.hasta) {
    const d = new Date(sp.hasta);
    if (!isNaN(d.getTime())) {
      d.setUTCHours(23, 59, 59, 999);
      hasta = d;
    }
  }

  let where = buildAuditoriaWhere(scope, {
    q: sp.q,
    entidad: sp.entidad,
    accion: sp.accion,
    userId: sp.userId,
    desde,
    hasta,
  });

  // Filtro extra por número de documento del cotizante.
  // Hacemos pre-query: buscar IDs de Cotizante y Afiliacion cuyo
  // cotizante tenga ese documento, y restringir el AuditLog a esos
  // entidadIds con entidad ∈ {Cotizante, Afiliacion}.
  const documentoFiltro = sp.documento?.trim();
  if (documentoFiltro) {
    const [cotizantes, afiliaciones] = await Promise.all([
      prisma.cotizante.findMany({
        where: { numeroDocumento: documentoFiltro },
        select: { id: true },
      }),
      prisma.afiliacion.findMany({
        where: { cotizante: { numeroDocumento: documentoFiltro } },
        select: { id: true },
      }),
    ]);
    const cotizanteIds = cotizantes.map((c) => c.id);
    const afiliacionIds = afiliaciones.map((a) => a.id);

    // Si no hay nada, forzamos resultado vacío
    const restriccion: Prisma.AuditLogWhereInput =
      cotizanteIds.length === 0 && afiliacionIds.length === 0
        ? { id: '__no_match_documento__' }
        : {
            OR: [
              ...(cotizanteIds.length > 0
                ? [{ entidad: 'Cotizante', entidadId: { in: cotizanteIds } }]
                : []),
              ...(afiliacionIds.length > 0
                ? [{ entidad: 'Afiliacion', entidadId: { in: afiliacionIds } }]
                : []),
            ],
          };
    where = { AND: [where, restriccion] };
  }

  // Cargas en paralelo: la página + el total + las opciones de filtros
  // (entidades, acciones, usuarios distintos en el ámbito visible). Las
  // opciones se computan SIN aplicar los filtros del usuario, solo el
  // scope — para que pueda cambiar de un filtro a otro sin "perderlos".
  const whereScope = buildAuditoriaWhere(scope, {});
  const [eventos, total, entidadesRaw, accionesRaw, usuariosRaw] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip,
      select: {
        id: true,
        entidad: true,
        entidadId: true,
        accion: true,
        userId: true,
        userName: true,
        userRole: true,
        descripcion: true,
        ip: true,
        cambios: true,
        createdAt: true,
        userSucursal: { select: { codigo: true } },
        entidadSucursal: { select: { codigo: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where: whereScope,
      distinct: ['entidad'],
      select: { entidad: true },
      orderBy: { entidad: 'asc' },
    }),
    prisma.auditLog.findMany({
      where: whereScope,
      distinct: ['accion'],
      select: { accion: true },
      orderBy: { accion: 'asc' },
    }),
    prisma.auditLog.findMany({
      where: { ...whereScope, userId: { not: null }, userName: { not: null } },
      distinct: ['userId'],
      select: { userId: true, userName: true },
      orderBy: { userName: 'asc' },
      take: 200,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const entidades = entidadesRaw.map((e) => e.entidad);
  const acciones = accionesRaw.map((a) => a.accion);
  const usuarios = usuariosRaw
    .filter((u): u is { userId: string; userName: string } => !!u.userId && !!u.userName)
    .map((u) => ({ id: u.userId, name: u.userName }));

  // Resolver IDs → nombres legibles (Sprint reorg). Hace queries en
  // lote para todos los entidadIds + IDs en cambios.antes/despues de
  // los eventos visibles en esta página.
  const resolverMap = await resolverEntidadesEnLote(eventos);
  const resolverDict = serializarResolver(resolverMap);

  // Helpers para construir URLs de paginación preservando filtros.
  function urlPagina(p: number): string {
    const qs = new URLSearchParams();
    if (sp.q) qs.set('q', sp.q);
    if (sp.entidad) qs.set('entidad', sp.entidad);
    if (sp.accion) qs.set('accion', sp.accion);
    if (sp.userId) qs.set('userId', sp.userId);
    if (sp.documento) qs.set('documento', sp.documento);
    if (sp.desde) qs.set('desde', sp.desde);
    if (sp.hasta) qs.set('hasta', sp.hasta);
    if (p > 1) qs.set('page', String(p));
    const s = qs.toString();
    return s ? `?${s}` : '';
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <History className="h-6 w-6 text-brand-blue" />
            Bitácora
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Histórico de cambios sobre cotizantes, empresas, planillas, cartera, incapacidades,
            usuarios y configuración.
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-600">
          {scope.tipo === 'STAFF' ? 'Vista global' : 'Solo tu sucursal'}
        </div>
      </header>

      <BitacoraFiltros entidades={entidades} acciones={acciones} usuarios={usuarios} />

      {/* Tabla */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {eventos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-sm text-slate-500">
            <ShieldAlert className="h-6 w-6 text-slate-300" />
            <p>Sin eventos para los filtros aplicados.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Fecha</th>
                <th className="px-3 py-2 text-left font-medium">Usuario</th>
                <th className="px-3 py-2 text-left font-medium">Acción</th>
                <th className="px-3 py-2 text-left font-medium">Entidad</th>
                <th className="px-3 py-2 text-left font-medium">Documento</th>
                <th className="px-3 py-2 text-left font-medium">Detalle</th>
                {scope.tipo === 'STAFF' && (
                  <th className="px-3 py-2 text-left font-medium">Sucursal</th>
                )}
                <th className="w-8 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eventos.map((ev) => {
                const tone = ACCION_TONE[ev.accion] ?? ACCION_DEFAULT;
                const Icon = tone.icon;
                const sucursalLabel = ev.userSucursal?.codigo ?? ev.entidadSucursal?.codigo ?? '—';
                const etiqueta = etiquetaEntidad(ev.entidadId, resolverMap);
                const docCotizante = resolverMap.get(ev.entidadId)?.documento ?? null;
                return (
                  <tr key={ev.id} className="text-slate-700 hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-slate-500">
                      {ev.createdAt.toLocaleString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2">
                      {ev.userName ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{ev.userName}</span>
                          {ev.userRole && (
                            <span className="text-[10px] text-slate-400">
                              {ROLE_LABELS[ev.userRole] ?? ev.userRole}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Sistema</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${tone.className}`}
                      >
                        <Icon className="h-3 w-3" />
                        {ev.accion}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {ev.entidad}
                      </span>
                      <div className="mt-0.5">
                        <span
                          className={
                            etiqueta.resuelto
                              ? 'text-[11px] font-medium text-slate-900'
                              : 'font-mono text-[10px] text-slate-400'
                          }
                        >
                          {etiqueta.label}
                        </span>
                        {etiqueta.sublabel && (
                          <span className="ml-1 text-[10px] text-slate-500">
                            · {etiqueta.sublabel}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-700">
                      {docCotizante ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {ev.descripcion ?? <span className="text-slate-400">—</span>}
                    </td>
                    {scope.tipo === 'STAFF' && (
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-slate-500">
                        {sucursalLabel}
                      </td>
                    )}
                    <td className="px-2 py-2">
                      <DetalleEventoTrigger
                        evento={{
                          id: ev.id,
                          entidad: ev.entidad,
                          entidadId: ev.entidadId,
                          accion: ev.accion,
                          userId: ev.userId,
                          userName: ev.userName,
                          userRole: ev.userRole,
                          userSucursalCodigo: ev.userSucursal?.codigo ?? null,
                          entidadSucursalCodigo: ev.entidadSucursal?.codigo ?? null,
                          descripcion: ev.descripcion,
                          ip: ev.ip,
                          cambios: ev.cambios,
                          createdAt: ev.createdAt.toISOString(),
                        }}
                        resolverDict={resolverDict}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Paginación */}
      {total > PAGE_SIZE && (
        <nav className="flex items-center justify-between text-xs text-slate-500">
          <p>
            Mostrando <strong>{skip + 1}</strong>–
            <strong>{Math.min(skip + PAGE_SIZE, total)}</strong> de <strong>{total}</strong> evento
            {total !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={urlPagina(page - 1)}
                className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
              >
                <ChevronLeft className="h-3 w-3" />
                Anterior
              </Link>
            ) : (
              <span className="flex items-center gap-1 rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-slate-300">
                <ChevronLeft className="h-3 w-3" />
                Anterior
              </span>
            )}
            <span className="px-2">
              Página <strong>{page}</strong> de <strong>{totalPages}</strong>
            </span>
            {page < totalPages ? (
              <Link
                href={urlPagina(page + 1)}
                className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
              >
                Siguiente
                <ChevronRight className="h-3 w-3" />
              </Link>
            ) : (
              <span className="flex items-center gap-1 rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-slate-300">
                Siguiente
                <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
