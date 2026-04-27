import { prisma } from '@pila/db';
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

  // Sprint Soporte reorg fase 2 — para el modal "Mi perfil" necesitamos
  // el código legible de la sucursal, no el cuid. Solo lo buscamos si
  // hay sucursalId (ALIADO_OWNER/USER); STAFF tiene null.
  let sucursalCodigo: string | null = null;
  if (session.user.sucursalId) {
    const s = await prisma.sucursal.findUnique({
      where: { id: session.user.sucursalId },
      select: { codigo: true, nombre: true },
    });
    sucursalCodigo = s ? `${s.codigo} · ${s.nombre}` : null;
  }

  return (
    <AdminShell
      userName={session.user.name}
      userRole={session.user.role}
      userEmail={session.user.email}
      userSucursalCodigo={sucursalCodigo}
    >
      {children}
    </AdminShell>
  );
}
