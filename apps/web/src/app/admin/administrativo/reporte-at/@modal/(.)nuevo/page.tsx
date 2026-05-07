/**
 * Intercepting Route — `(.)nuevo` intercepta la navegación a
 * `/admin/administrativo/reporte-at/nuevo` cuando viene desde la lista
 * (mismo nivel) y la renderiza dentro del slot `@modal`. La URL en el
 * browser cambia, pero la página de listado permanece detrás. Refresh
 * o acceso directo cae al `nuevo/page.tsx` standalone.
 */

import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { RadicarModalShell } from '../../_components/radicar-modal-shell';

export const dynamic = 'force-dynamic';

export default async function ReporteAtNuevoModal() {
  const session = await requirePermiso('admin.reporte_at');
  const scope = await getUserScope();

  const sucursales =
    scope?.tipo === 'STAFF'
      ? await prisma.sucursal.findMany({
          where: { active: true },
          orderBy: { codigo: 'asc' },
          select: { id: true, codigo: true, nombre: true },
        })
      : [];
  const sucursalIdActual = scope?.tipo === 'SUCURSAL' ? scope.sucursalId : null;

  return (
    <RadicarModalShell
      sucursales={sucursales}
      sucursalIdActual={sucursalIdActual}
      elaboradoPorDefault={{
        nombre: session.user.name,
        correo: session.user.email,
      }}
    />
  );
}
