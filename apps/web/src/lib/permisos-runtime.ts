/**
 * Helpers runtime para chequear permisos finos vía RolCustom.
 *
 * `lib/permisos.ts` declara la MATRIZ (qué módulos + acciones existen).
 * Este módulo implementa la consulta en BD: "el user X ¿tiene el permiso
 * (modulo, accion)?".
 *
 * Reglas:
 *   - ADMIN siempre tiene todo (no se chequea contra BD).
 *   - Si el user no tiene `rolCustomId`, retorna `false` para cualquier
 *     permiso fino — los users sin RolCustom solo tienen lo que su Role
 *     base les da (chequeable con `requireStaff`/`requireRole`).
 *   - Si tiene `rolCustomId`, busca en `permisos_custom` la fila
 *     `(rolCustomId, modulo, accion)` — si existe → `true`.
 *
 * Caso de uso principal hoy:
 *   `tienePermiso(user, 'soporte.juridico_confidencial', 'VER')`
 *   para autorizar la descarga de documentos confidenciales.
 *
 * El uso es READ-ONLY contra Prisma — barato. Si en el futuro se vuelve
 * caliente, agregar caché in-memory por session (los permisos no cambian
 * dentro de una sesión salvo que un admin edite el rol).
 */

import { prisma } from '@pila/db';
import type { Role } from '@pila/db';
import type { Accion } from './permisos';

export type UserContext = {
  id: string;
  role: Role;
  rolCustomId?: string | null;
};

/**
 * `true` si el user tiene la acción concedida sobre el módulo. ADMIN
 * siempre devuelve `true`. SOPORTE solo si su RolCustom incluye el
 * permiso explícito.
 */
export async function tienePermiso(
  user: UserContext,
  modulo: string,
  accion: Accion,
): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (!user.rolCustomId) return false;

  // PermisoCustom usa clave compuesta (rolCustomId, modulo, accion) como
  // PK — usamos findUnique para hit directo del índice.
  const permiso = await prisma.permisoCustom.findUnique({
    where: {
      rolCustomId_modulo_accion: {
        rolCustomId: user.rolCustomId,
        modulo,
        accion,
      },
    },
    select: { rolCustomId: true },
  });
  return permiso !== null;
}

/**
 * Atajo específico para el chequeo más frecuente del flujo jurídico.
 * Llamado desde el endpoint de descarga + en el render del listado de
 * documentos para decidir si mostrar el botón de descarga habilitado.
 */
export async function puedeDescargarDocConfidencial(user: UserContext): Promise<boolean> {
  return tienePermiso(user, 'soporte.juridico_confidencial', 'VER');
}
