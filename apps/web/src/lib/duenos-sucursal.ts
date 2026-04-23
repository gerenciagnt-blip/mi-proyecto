import { prisma } from '@pila/db';

/**
 * Devuelve un mapa `sucursalId -> nombre del dueño aliado (ALIADO_OWNER)`.
 *
 * Si una sucursal tiene varios ALIADO_OWNER activos, toma el primero
 * por fecha de creación. Este mapa se usa en las tablas del lado Soporte
 * para mostrar a qué aliado pertenece cada registro.
 */
export async function cargarDuenosPorSucursal(): Promise<Map<string, string>> {
  const rows = await prisma.user.findMany({
    where: {
      role: 'ALIADO_OWNER',
      active: true,
      sucursalId: { not: null },
    },
    orderBy: { createdAt: 'asc' },
    select: { sucursalId: true, name: true },
  });

  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.sucursalId && !map.has(r.sucursalId)) {
      map.set(r.sucursalId, r.name);
    }
  }
  return map;
}
