import { requireAuth } from '@/lib/auth-helpers';
import { AdminShell } from '@/components/admin/admin-shell';

/**
 * Layout del panel admin. Cualquier usuario autenticado (ADMIN / SOPORTE /
 * ALIADO_OWNER / ALIADO_USER) entra — la visibilidad de los módulos se
 * controla en el sidebar (filtrado por rol) y cada ruta staff-only tiene
 * su propia guard de acceso.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();

  return (
    <AdminShell userName={session.user.name} userRole={session.user.role}>
      {children}
    </AdminShell>
  );
}
