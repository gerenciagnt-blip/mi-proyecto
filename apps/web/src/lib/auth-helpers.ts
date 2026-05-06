import { redirect } from 'next/navigation';
import type { Role } from '@pila/db';
import { auth } from '@/auth';
import { puedeAccederModulo } from './permisos-runtime';

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return session;
}

export async function requireRole(...allowed: Role[]) {
  const session = await requireAuth();
  // Redirect a `/admin` (landing) cuando el rol no tiene acceso — el
  // panel filtra por rol y muestra lo que sí puede ver.
  if (!allowed.includes(session.user.role)) redirect('/admin');
  return session;
}

/**
 * Solo ADMIN. Usado en operaciones críticas (configuración global, gestión
 * de usuarios, roles, etc.).
 */
export async function requireAdmin() {
  return requireRole('ADMIN');
}

/**
 * Staff de la plataforma (ADMIN o SOPORTE). Usado en operaciones que
 * necesitan visibilidad cross-sucursal pero no requieren el poder total
 * de ADMIN — por default SOPORTE tiene los mismos permisos que ADMIN,
 * ajustables desde la matriz de permisos.
 */
export async function requireStaff() {
  return requireRole('ADMIN', 'SOPORTE');
}

/**
 * Atajo para chequear si una sesión es staff (ADMIN o SOPORTE) sin redirigir.
 * Útil dentro de queries para decidir si aplicar scope por sucursal.
 */
export function esStaff(role: Role): boolean {
  return role === 'ADMIN' || role === 'SOPORTE';
}

/**
 * Sprint Permisos — Page guard granular.
 *
 * Combina autenticación + chequeo del módulo. Si el user puede acceder
 * (según `puedeAccederModulo`: ADMIN siempre, sin RolCustom → defaults
 * por rol base, con RolCustom → matriz custom), retorna la sesión.
 * Si no, redirige a `/admin` (landing protegida).
 *
 * Ejemplo de uso en una page admin:
 *   ```ts
 *   export default async function BitacoraPage() {
 *     await requirePermiso('config.bitacora');
 *     // ...
 *   }
 *   ```
 *
 * Reemplaza/complementa a `requireStaff`/`requireRole` de las pages —
 * los users con RolCustom limitado se bloquean aunque su rol base les
 * daría acceso.
 */
export async function requirePermiso(modulo: string) {
  const session = await requireAuth();
  const ok = await puedeAccederModulo(
    {
      id: session.user.id,
      role: session.user.role,
      rolCustomId: session.user.rolCustomId,
    },
    modulo,
  );
  if (!ok) redirect('/admin');
  return session;
}
