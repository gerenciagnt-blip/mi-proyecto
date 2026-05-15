import type { Role, Prisma } from '@pila/db';
import { prisma } from '@pila/db';

/**
 * Sprint Chat interno — reglas de quién puede iniciar/aparecer en una
 * conversación con quién. Vive en la capa de aplicación (no en BD) para
 * cambiar la matriz sin migraciones.
 *
 * Matriz v1 (simétrica — si A puede chatear con B, B puede con A):
 *
 *   ADMIN / SOPORTE    → con cualquiera.
 *   ALIADO_OWNER       → staff + sus ALIADO_USER + sus ASESOR_COMERCIAL
 *                        (mismo sucursalId).
 *   ALIADO_USER        → staff + su ALIADO_OWNER (mismo sucursalId).
 *   ASESOR_COMERCIAL   → staff + su ALIADO_OWNER (mismo sucursalId).
 *
 * Devuelve un `where` Prisma que filtra los users que el `actor` puede
 * elegir como contraparte. Excluye al propio actor.
 */

export type ActorContext = {
  userId: string;
  role: Role;
  sucursalId: string | null;
};

/**
 * Devuelve el fragmento `where` con los users que el actor puede
 * chatear. Para staff es "todos los demás activos". Para roles aliado
 * es staff + roles permitidos de la misma sucursal.
 */
export function whereUsuariosElegibles(actor: ActorContext): Prisma.UserWhereInput {
  const baseExcluyeAlActor: Prisma.UserWhereInput = {
    id: { not: actor.userId },
    active: true,
  };

  // STAFF puede chatear con cualquiera.
  if (actor.role === 'ADMIN' || actor.role === 'SOPORTE') {
    return baseExcluyeAlActor;
  }

  // Sin sucursal = aliado mal configurado — no chatea con nadie.
  if (!actor.sucursalId) {
    return { ...baseExcluyeAlActor, id: '__no_match__' };
  }

  // Para roles aliado: staff (cualquier sucursal) + roles permitidos de
  // su propia sucursal.
  let rolesAliadoPermitidos: Role[];
  switch (actor.role) {
    case 'ALIADO_OWNER':
      rolesAliadoPermitidos = ['ALIADO_USER', 'ASESOR_COMERCIAL'];
      break;
    case 'ALIADO_USER':
    case 'ASESOR_COMERCIAL':
      rolesAliadoPermitidos = ['ALIADO_OWNER'];
      break;
    default:
      // Defensa: rol desconocido → solo staff.
      rolesAliadoPermitidos = [];
  }

  return {
    ...baseExcluyeAlActor,
    OR: [
      // Staff de cualquier sucursal (staff no tiene sucursalId).
      { role: { in: ['ADMIN', 'SOPORTE'] } },
      // Aliados permitidos de mi sucursal.
      {
        role: { in: rolesAliadoPermitidos },
        sucursalId: actor.sucursalId,
      },
    ],
  };
}

/**
 * Verifica si el `actor` puede iniciar/participar en una conversación
 * con el set de `userIds` dados (todos los participantes excepto él).
 * Devuelve null si todos son elegibles, o un mensaje de error si alguno
 * no lo es. Usado por `crearConversacionAction` antes de persistir.
 *
 * Usa el cliente Prisma global (no transaction) — la validación NO está
 * dentro de la transacción de creación porque queremos cortar antes con
 * un mensaje claro al user. Race-condition trivial (no toca datos).
 */
export async function validarParticipantes(
  actor: ActorContext,
  participantesIds: string[],
): Promise<string | null> {
  if (participantesIds.length === 0) return 'Selecciona al menos un participante';
  if (participantesIds.includes(actor.userId)) {
    return 'No te incluyas a ti mismo en la lista de participantes';
  }
  const where = whereUsuariosElegibles(actor);
  const elegibles = await prisma.user.findMany({
    where: { ...where, id: { in: participantesIds } },
    select: { id: true },
  });
  if (elegibles.length !== participantesIds.length) {
    return 'Uno o más participantes no son elegibles para tu rol';
  }
  return null;
}
