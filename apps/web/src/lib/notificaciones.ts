/**
 * Sistema de notificaciones in-app.
 *
 * Una notificación tiene targeting tripartito:
 *   - destinoUserId: notificación dirigida a un usuario específico.
 *   - destinoRole: dirigida a todos los usuarios del rol (ej. SOPORTE).
 *   - destinoSucursalId: dirigida a todos los usuarios de una sucursal
 *     (típicamente ALIADO_OWNER + ALIADO_USER).
 *
 * El estado de "leída" se guarda por usuario en `NotificacionLectura`.
 * Una notificación dirigida a un rol o sucursal aparece como no-leída
 * para cada usuario hasta que cada uno la lea por separado.
 */

import { Prisma, prisma, type NotificacionTipo, type Role } from '@pila/db';
import { createLogger } from './logger';

const log = createLogger('notif');

export type EmitirNotificacionInput = {
  tipo: NotificacionTipo;
  /** Al menos uno de estos tres debe estar definido. */
  destinoUserId?: string | null;
  destinoRole?: Role | null;
  destinoSucursalId?: string | null;
  titulo: string;
  mensaje: string;
  href?: string | null;
  metadatos?: Record<string, unknown> | null;
};

/**
 * Crea una notificación. Las llamadas son fire-and-forget — los errores
 * se loggean pero no rompen la operación principal (ej. radicar una
 * incapacidad sigue exitoso aunque falle la notificación).
 */
export async function emitirNotificacion(
  input: EmitirNotificacionInput,
): Promise<{ id: string } | null> {
  const tieneTarget = !!input.destinoUserId || !!input.destinoRole || !!input.destinoSucursalId;
  if (!tieneTarget) {
    log.warn({ tipo: input.tipo }, 'emitirNotificacion sin target — se ignora');
    return null;
  }

  try {
    const row = await prisma.notificacion.create({
      data: {
        tipo: input.tipo,
        destinoUserId: input.destinoUserId ?? null,
        destinoRole: input.destinoRole ?? null,
        destinoSucursalId: input.destinoSucursalId ?? null,
        titulo: input.titulo,
        mensaje: input.mensaje,
        href: input.href ?? null,
        metadatos: input.metadatos ? (input.metadatos as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
      select: { id: true },
    });
    return row;
  } catch (e) {
    log.error({ tipo: input.tipo, err: e }, 'emitirNotificacion falló');
    return null;
  }
}

export type NotificacionResumen = {
  id: string;
  tipo: NotificacionTipo;
  titulo: string;
  mensaje: string;
  href: string | null;
  createdAt: Date;
  leida: boolean;
};

/** Where para listar notificaciones visibles a un usuario dado. */
function whereVisibles(userId: string, role: Role, sucursalId: string | null) {
  // OR de los 3 targets — al menos uno debe matchear.
  const orClauses = [{ destinoUserId: userId }, { destinoRole: role }] as Array<{
    destinoUserId?: string;
    destinoRole?: Role;
    destinoSucursalId?: string;
  }>;
  if (sucursalId) orClauses.push({ destinoSucursalId: sucursalId });
  return { OR: orClauses };
}

/** Cuenta no leídas para mostrar el badge de la campana. */
export async function contarNoLeidas(
  userId: string,
  role: Role,
  sucursalId: string | null,
): Promise<number> {
  return prisma.notificacion.count({
    where: {
      ...whereVisibles(userId, role, sucursalId),
      lecturas: { none: { userId } },
    },
  });
}

/** Lista las últimas N notificaciones (mezcla leídas y no leídas). */
export async function listarRecientes(
  userId: string,
  role: Role,
  sucursalId: string | null,
  take = 20,
): Promise<NotificacionResumen[]> {
  const rows = await prisma.notificacion.findMany({
    where: whereVisibles(userId, role, sucursalId),
    orderBy: { createdAt: 'desc' },
    take,
    include: { lecturas: { where: { userId }, select: { id: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    titulo: r.titulo,
    mensaje: r.mensaje,
    href: r.href,
    createdAt: r.createdAt,
    leida: r.lecturas.length > 0,
  }));
}

export type ListarHistoricoFiltros = {
  tipo?: NotificacionTipo;
  /** "todas" | "leidas" | "no_leidas" */
  estadoLectura?: 'todas' | 'leidas' | 'no_leidas';
  /** Texto a buscar en título o mensaje (case-insensitive). */
  q?: string;
  desde?: Date;
  hasta?: Date;
  /** Paginación 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type ListarHistoricoResult = {
  items: NotificacionResumen[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Lista paginada con filtros para la página /admin/notificaciones.
 * No es lo mismo que `listarRecientes` (que solo trae las últimas 20 sin
 * filtros, para el dropdown de la campana). Esta query es más cara —
 * usarla solo en la página completa.
 */
export async function listarHistorico(
  userId: string,
  role: Role,
  sucursalId: string | null,
  filtros: ListarHistoricoFiltros = {},
): Promise<ListarHistoricoResult> {
  const page = Math.max(1, filtros.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filtros.pageSize ?? 25));

  const where: Prisma.NotificacionWhereInput = {
    ...whereVisibles(userId, role, sucursalId),
  };
  if (filtros.tipo) where.tipo = filtros.tipo;
  if (filtros.q && filtros.q.trim().length > 0) {
    const q = filtros.q.trim();
    where.OR = [
      { titulo: { contains: q, mode: 'insensitive' } },
      { mensaje: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (filtros.desde || filtros.hasta) {
    where.createdAt = {};
    if (filtros.desde) where.createdAt.gte = filtros.desde;
    if (filtros.hasta) where.createdAt.lte = filtros.hasta;
  }
  if (filtros.estadoLectura === 'leidas') {
    where.lecturas = { some: { userId } };
  } else if (filtros.estadoLectura === 'no_leidas') {
    where.lecturas = { none: { userId } };
  }

  const [rows, total] = await Promise.all([
    prisma.notificacion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { lecturas: { where: { userId }, select: { id: true } } },
    }),
    prisma.notificacion.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      titulo: r.titulo,
      mensaje: r.mensaje,
      href: r.href,
      createdAt: r.createdAt,
      leida: r.lecturas.length > 0,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Marca una notificación como leída por un usuario (idempotente). */
export async function marcarLeida(notificacionId: string, userId: string): Promise<void> {
  // Validamos que el usuario realmente sea destinatario antes de crear la
  // marca de lectura — evita que un usuario "lea" una notificación ajena.
  const notif = await prisma.notificacion.findUnique({
    where: { id: notificacionId },
    select: { destinoUserId: true, destinoRole: true, destinoSucursalId: true },
  });
  if (!notif) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, sucursalId: true },
  });
  if (!user) return;
  const esDestino =
    notif.destinoUserId === userId ||
    (notif.destinoRole && notif.destinoRole === user.role) ||
    (notif.destinoSucursalId && notif.destinoSucursalId === user.sucursalId);
  if (!esDestino) return;

  await prisma.notificacionLectura.upsert({
    where: { notificacionId_userId: { notificacionId, userId } },
    create: { notificacionId, userId },
    update: {}, // no-op si ya estaba leída
  });
}

/** Marca todas las notificaciones visibles del usuario como leídas. */
export async function marcarTodasLeidas(
  userId: string,
  role: Role,
  sucursalId: string | null,
): Promise<number> {
  // Buscamos las que aún no están leídas y creamos la fila de lectura.
  const pendientes = await prisma.notificacion.findMany({
    where: {
      ...whereVisibles(userId, role, sucursalId),
      lecturas: { none: { userId } },
    },
    select: { id: true },
  });
  if (pendientes.length === 0) return 0;
  await prisma.notificacionLectura.createMany({
    data: pendientes.map((p) => ({ notificacionId: p.id, userId })),
    skipDuplicates: true,
  });
  return pendientes.length;
}
