import type { Prisma } from '@pila/db';
import type { UserScope } from '@/lib/sucursal-scope';

/**
 * Construye el `WHERE` Prisma para listar `AuditLog` según el scope del
 * usuario logueado. Encapsula la regla de visibilidad acordada en Sprint 6:
 *
 *   - STAFF (ADMIN, SOPORTE) → todo, sin filtro.
 *   - ALIADO_OWNER → eventos donde:
 *       (a) el actor pertenecía a su sucursal (`userSucursalId = X`), O
 *       (b) la entidad afectada pertenece a su sucursal (`entidadSucursalId = X`).
 *     Esto le da visibilidad sobre lo que hace su gente Y lo que pasa con
 *     sus recursos (incluso si lo movió un staff).
 *   - ALIADO_USER → no debería llegar aquí (la página los bloquea con
 *     `requireRole`); por seguridad, devolvemos un filtro imposible.
 *
 * Importante: para entidades GLOBALES (catálogos, asesores globales,
 * empresas planilla), `entidadSucursalId` es null y por tanto NO matchea
 * la condición (b). Eso es deliberado — un aliado no debería ver eventos
 * de configuración global del sistema.
 */
export function whereAuditoriaSegunScope(scope: UserScope): Prisma.AuditLogWhereInput {
  if (scope.tipo === 'STAFF') {
    return {}; // sin filtro — staff ve todo
  }

  // SUCURSAL: si es ALIADO_OWNER, ve eventos de su sucursal. Si es
  // ALIADO_USER (sub-rol), aplicamos la misma regla pero la página debió
  // haberlo bloqueado antes vía requireRole.
  if (scope.role === 'ALIADO_OWNER') {
    return {
      OR: [{ userSucursalId: scope.sucursalId }, { entidadSucursalId: scope.sucursalId }],
    };
  }

  // Defensa: cualquier otro rol scoped que llegue aquí no ve nada.
  // Usamos un filtro imposible (id que nunca existirá) para devolver lista vacía
  // en lugar de tirar error.
  return { id: '__no_match__' };
}

/**
 * Helper auxiliar que combina el scope con filtros adicionales del
 * usuario (entidad, acción, rango de fechas, búsqueda de texto). El
 * resultado es lo que se pasa al `prisma.auditLog.findMany`.
 */
export function buildAuditoriaWhere(
  scope: UserScope,
  filtros: {
    entidad?: string;
    accion?: string;
    userId?: string;
    desde?: Date;
    hasta?: Date;
    /** Búsqueda por texto en `descripcion` o `entidadId`. */
    q?: string;
  } = {},
): Prisma.AuditLogWhereInput {
  const base = whereAuditoriaSegunScope(scope);

  // Combinamos el WHERE de scope con los filtros del usuario. Si scope
  // ya trajo un OR, lo metemos dentro de un AND con los filtros para no
  // perder la visibilidad. Si scope es {} (staff), simplemente usamos los
  // filtros.
  const filterClauses: Prisma.AuditLogWhereInput[] = [];

  if (filtros.entidad) filterClauses.push({ entidad: filtros.entidad });
  if (filtros.accion) filterClauses.push({ accion: filtros.accion });
  if (filtros.userId) filterClauses.push({ userId: filtros.userId });

  if (filtros.desde || filtros.hasta) {
    filterClauses.push({
      createdAt: {
        ...(filtros.desde ? { gte: filtros.desde } : {}),
        ...(filtros.hasta ? { lte: filtros.hasta } : {}),
      },
    });
  }

  if (filtros.q) {
    const q = filtros.q.trim();
    if (q) {
      filterClauses.push({
        OR: [
          { descripcion: { contains: q, mode: 'insensitive' } },
          { entidadId: { contains: q, mode: 'insensitive' } },
          { userName: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
  }

  if (filterClauses.length === 0) return base;

  // Si base es {} (staff sin scope), AND es transparente: AND[ ...filtros ].
  // Si base trae OR (aliado_owner), AND lo combina sin perderse.
  return { AND: [base, ...filterClauses] };
}
