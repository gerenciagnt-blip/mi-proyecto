import type { Role } from '@pila/db';
import { auth } from '@/auth';

/**
 * Scope de acceso de un usuario en el modelo multi-tenant.
 *
 *   - STAFF (ADMIN o SOPORTE) → ve todo, cross-sucursal.
 *   - SUCURSAL (ALIADO_OWNER, ALIADO_USER y roles custom derivados) →
 *     ve sólo la sucursal a la que está asignado.
 *
 * Se usa desde server actions / page.tsx para armar `where` filtrados
 * por sucursal cuando corresponde, sin duplicar la lógica.
 */
export type UserScope =
  | { tipo: 'STAFF'; role: Role; userId: string }
  | { tipo: 'SUCURSAL'; role: Role; userId: string; sucursalId: string };

function esStaffRole(role: Role): boolean {
  return role === 'ADMIN' || role === 'SOPORTE';
}

/**
 * Obtiene el scope del usuario actual. Si no hay sesión o el usuario
 * es aliado sin sucursalId, devuelve null (el caller debe decidir qué
 * hacer — típicamente requireAuth ya evitó llegar aquí sin sesión).
 */
export async function getUserScope(): Promise<UserScope | null> {
  const session = await auth();
  if (!session?.user) return null;
  const role = session.user.role;
  const userId = session.user.id;

  if (esStaffRole(role)) {
    return { tipo: 'STAFF', role, userId };
  }

  const sucursalId = session.user.sucursalId;
  if (!sucursalId) return null; // aliado sin sucursal = inconsistente
  return { tipo: 'SUCURSAL', role, userId, sucursalId };
}

/**
 * Devuelve el fragmento `where` que filtra por sucursalId según el
 * scope del usuario.
 *
 *   - STAFF → {} (sin filtro, ve todo)
 *   - SUCURSAL → { sucursalId }
 *
 * Úsalo en recursos que SIEMPRE tienen sucursalId NOT NULL (ej.
 * CuentaCobro, ComprobanteFormato):
 *
 *   const scope = await scopeWhere();
 *   const rows = await prisma.cuentaCobro.findMany({
 *     where: { active: true, ...scope },
 *   });
 */
export async function scopeWhere(): Promise<{ sucursalId?: string }> {
  const s = await getUserScope();
  if (!s || s.tipo === 'STAFF') return {};
  return { sucursalId: s.sucursalId };
}

/**
 * Variante para recursos con sucursalId NULLABLE — donde NULL significa
 * "global, visible por todas las sucursales".
 *
 *   - STAFF → {} (ve todos: globales + por sucursal)
 *   - SUCURSAL → { OR: [{ sucursalId: null }, { sucursalId: mi sucursal }] }
 *
 * Úsalo en recursos compartibles (MedioPago, AsesorComercial,
 * ServicioAdicional):
 *
 *   const scope = await scopeWhereOpt();
 *   const rows = await prisma.medioPago.findMany({
 *     where: { active: true, ...scope },
 *   });
 */
export async function scopeWhereOpt(): Promise<{
  OR?: Array<{ sucursalId: string | null }>;
}> {
  const s = await getUserScope();
  if (!s || s.tipo === 'STAFF') return {};
  return {
    OR: [{ sucursalId: null }, { sucursalId: s.sucursalId }],
  };
}

/**
 * Valida que el `sucursalId` que un usuario intenta usar al crear/editar
 * un recurso sea permitido por su scope.
 *
 *   - STAFF puede asignar cualquier sucursalId o null (global).
 *   - SUCURSAL sólo puede asignar su propia sucursalId (nunca global ni otra).
 *
 * Retorna `null` si es válido, o un mensaje de error si no.
 */
export async function validarSucursalIdAsignable(
  sucursalId: string | null,
): Promise<string | null> {
  const s = await getUserScope();
  if (!s) return 'Sesión inválida';
  if (s.tipo === 'STAFF') return null; // puede asignar cualquier cosa
  if (sucursalId === null) {
    return 'No tienes permiso para crear recursos globales';
  }
  if (sucursalId !== s.sucursalId) {
    return 'No puedes crear recursos en otra sucursal';
  }
  return null;
}

/**
 * Variante específica para recursos indirectamente scoped vía Cotizante:
 * afiliaciones, comprobantes, gestiones de cartera, liquidaciones.
 *
 *   - STAFF → {}
 *   - SUCURSAL → { cotizante: { sucursalId: mi sucursal } }
 *
 * Úsalo en queries tipo:
 *   const scope = await scopeWhereViaCotizante();
 *   const afs = await prisma.afiliacion.findMany({
 *     where: { estado: 'ACTIVA', ...scope },
 *   });
 */
export async function scopeWhereViaCotizante(): Promise<{
  cotizante?: { sucursalId: string };
}> {
  const s = await getUserScope();
  if (!s || s.tipo === 'STAFF') return {};
  return { cotizante: { sucursalId: s.sucursalId } };
}

/**
 * Scope directo para recursos con `sucursalId` propio (Cotizante, Planilla).
 * Alias conveniente de scopeWhere() con tipado explícito.
 */
export async function scopeWhereDirect(): Promise<{ sucursalId?: string }> {
  return scopeWhere();
}

