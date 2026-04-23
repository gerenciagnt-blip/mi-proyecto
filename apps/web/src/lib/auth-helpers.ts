import { redirect } from 'next/navigation';
import type { Role } from '@pila/db';
import { auth } from '@/auth';

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return session;
}

export async function requireRole(...allowed: Role[]) {
  const session = await requireAuth();
  if (!allowed.includes(session.user.role)) redirect('/dashboard');
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
