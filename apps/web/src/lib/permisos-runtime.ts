/**
 * Helpers runtime para chequear permisos finos vía RolCustom.
 *
 * `lib/permisos.ts` declara la MATRIZ (qué módulos + acciones existen).
 * Este módulo implementa la consulta en BD: "el user X ¿tiene el permiso
 * (modulo, accion)?".
 *
 * Reglas (`tienePermiso`):
 *   - ADMIN siempre tiene todo (no se chequea contra BD).
 *   - Si el user no tiene `rolCustomId`, retorna `false` para cualquier
 *     permiso fino — los users sin RolCustom solo tienen lo que su Role
 *     base les da (chequeable con `requireStaff`/`requireRole`).
 *   - Si tiene `rolCustomId`, busca en `permisos_custom` la fila
 *     `(rolCustomId, modulo, accion)` — si existe → `true`.
 *
 * Para chequeo de page guard (acceso a un módulo) usar
 * `puedeAccederModulo` que combina rol base + RolCustom.
 */

import { prisma } from '@pila/db';
import type { Role } from '@pila/db';
import { MODULOS, type Accion } from './permisos';

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

/**
 * Decide si el user puede ACCEDER (ver) un módulo. Combina rol base +
 * RolCustom granular para soportar la mayoría de users sin perder la
 * granularidad de los que sí tienen RolCustom.
 *
 * Reglas:
 *   1. ADMIN → siempre `true` sin tocar BD.
 *   2. Si el user NO tiene `rolCustomId` (default — la mayoría):
 *      - Si el módulo declara `rolesAplica` y el rol está en la lista → `true`.
 *      - Si el módulo no declara `rolesAplica` → `true` (aplica a todos).
 *      - Si el módulo declara `rolesAplica` y el rol NO está → `false`.
 *      - Si el módulo no existe en MODULOS → `false` (deny por defecto).
 *   3. Si el user TIENE `rolCustomId`:
 *      - La matriz `permisos_custom` es la fuente de verdad. Solo si
 *        existe la fila `(rolCustomId, modulo, 'VER')` el acceso pasa.
 *
 * Este es el helper que usan los page guards (`requirePermiso`).
 *
 * **Idempotente con `requireRole`/`requireStaff` previo**: para users
 * sin RolCustom, el resultado coincide con el chequeo del rol base
 * (lo cual era la única protección antes de Sprint Permisos).
 */
export async function puedeAccederModulo(user: UserContext, modulo: string): Promise<boolean> {
  if (user.role === 'ADMIN') return true;

  const moduloDef = MODULOS.find((m) => m.key === modulo);
  if (!moduloDef) return false; // deny por defecto si el módulo no está declarado

  if (!user.rolCustomId) {
    if (!moduloDef.rolesAplica) return true; // sin restricción → todos
    return moduloDef.rolesAplica.includes(user.role);
  }

  // Con RolCustom: la matriz manda. La acción mínima es VER.
  const permiso = await prisma.permisoCustom.findUnique({
    where: {
      rolCustomId_modulo_accion: {
        rolCustomId: user.rolCustomId,
        modulo,
        accion: 'VER',
      },
    },
    select: { rolCustomId: true },
  });
  return permiso !== null;
}
