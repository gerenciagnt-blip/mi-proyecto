import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { AdminShell } from '@/components/admin/admin-shell';
import { MODULOS } from '@/lib/permisos';
import { puedeAccederModulo } from '@/lib/permisos-runtime';

/**
 * Layout del panel admin. Cualquier usuario autenticado (ADMIN / SOPORTE /
 * ALIADO_OWNER / ALIADO_USER) entra — la visibilidad de los módulos se
 * controla en el sidebar (filtrado por rol + RolCustom) y cada ruta
 * staff-only tiene su propia guard de acceso.
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

  // Sprint Permisos — calcula qué módulos del catálogo el user puede
  // ver, para que el sidebar oculte los que no aplican (en lugar de
  // mostrarlos y bloquear solo al click). ADMIN siempre ve todo (la
  // función short-circuita y no toca BD). Users sin RolCustom pasan
  // por el chequeo `rolesAplica` de cada módulo (sync, sin BD). Users
  // con RolCustom hacen N queries paralelas — barato hoy (~25 módulos)
  // pero si crece, optimizar a un único findMany filtrado.
  const userCtx = {
    id: session.user.id,
    role: session.user.role,
    rolCustomId: session.user.rolCustomId,
  };
  const checks = await Promise.all(
    MODULOS.map(async (m) => ({ key: m.key, ok: await puedeAccederModulo(userCtx, m.key) })),
  );
  const modulosAccesibles = checks.filter((c) => c.ok).map((c) => c.key);

  return (
    <AdminShell
      userName={session.user.name}
      userRole={session.user.role}
      userEmail={session.user.email}
      userSucursalCodigo={sucursalCodigo}
      modulosAccesibles={modulosAccesibles}
    >
      {children}
    </AdminShell>
  );
}
