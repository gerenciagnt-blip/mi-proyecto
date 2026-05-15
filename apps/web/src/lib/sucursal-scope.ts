import type { Role, Prisma } from '@pila/db';
import { auth } from '@/auth';

/**
 * Scope de acceso de un usuario en el modelo multi-tenant.
 *
 *   - STAFF (ADMIN o SOPORTE) → ve todo, cross-sucursal.
 *   - SUCURSAL (ALIADO_OWNER, ALIADO_USER y roles custom derivados) →
 *     ve sólo la sucursal a la que está asignado.
 *   - ASESOR (ASESOR_COMERCIAL) — Sprint Asesor Comercial — sub-rol del
 *     aliado: ve sólo lo amarrado a su catálogo `AsesorComercial`
 *     (Afiliaciones donde `asesorComercialId = el suyo`) + el resto del
 *     scope sucursal (para catálogos compartidos y consultas indirectas).
 *
 * Se usa desde server actions / page.tsx para armar `where` filtrados
 * sin duplicar la lógica.
 */
export type UserScope =
  | { tipo: 'STAFF'; role: Role; userId: string }
  | { tipo: 'SUCURSAL'; role: Role; userId: string; sucursalId: string }
  | {
      tipo: 'ASESOR';
      role: Role;
      userId: string;
      sucursalId: string;
      asesorComercialId: string;
    };

function esStaffRole(role: Role): boolean {
  return role === 'ADMIN' || role === 'SOPORTE';
}

/**
 * Obtiene el scope del usuario actual. Si no hay sesión, o el usuario
 * es aliado sin sucursalId, o es asesor sin asesorComercialId, devuelve
 * null (el caller debe decidir qué hacer — típicamente requireAuth ya
 * evitó llegar aquí sin sesión).
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

  if (role === 'ASESOR_COMERCIAL') {
    const asesorComercialId = session.user.asesorComercialId;
    // Asesor sin amarre al catálogo = login mal configurado. Mejor null
    // que mostrarle todo: el caller (requireAuth/requirePermiso) ya
    // bloquea aguas arriba — esto es defensa en profundidad.
    if (!asesorComercialId) return null;
    return { tipo: 'ASESOR', role, userId, sucursalId, asesorComercialId };
  }

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
  // SUCURSAL y ASESOR comparten el mismo filtro por sucursal — el asesor
  // hereda los catálogos/cuentas/medios visibles a su aliado.
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

/**
 * Sprint Asesor Comercial — scope específico para queries sobre
 * `Afiliacion`. Combina filtro por sucursal del cotizante y, si el rol
 * es ASESOR_COMERCIAL, además filtra por `asesorComercialId = el suyo`.
 *
 *   - STAFF → {} (sin filtro)
 *   - SUCURSAL → { cotizante: { sucursalId: X } }
 *   - ASESOR → {
 *       asesorComercialId: el suyo,
 *       cotizante: { sucursalId: la suya }
 *     }
 *
 * Para resources hijos de Afiliacion (CarteraConsolidado, CarteraGestion,
 * Comprobante, etc.) usar `scopeWhereAfiliacionRel('afiliacion')` que
 * arma el mismo bloque pero anidado bajo la relación.
 *
 * Importante: una afiliación sin `asesorComercialId` NUNCA es visible
 * para un ASESOR_COMERCIAL — el filtro es estricto. Es la regla de
 * negocio: el asesor solo ve "lo suyo".
 */
export async function scopeWhereAfiliacion(): Promise<Prisma.AfiliacionWhereInput> {
  const s = await getUserScope();
  if (!s || s.tipo === 'STAFF') return {};
  if (s.tipo === 'ASESOR') {
    return {
      asesorComercialId: s.asesorComercialId,
      cotizante: { sucursalId: s.sucursalId },
    };
  }
  return { cotizante: { sucursalId: s.sucursalId } };
}

/**
 * Variante del helper anterior para queries sobre recursos hijos de
 * Afiliacion (Cartera, Comprobante, Liquidacion, etc.) — encapsula el
 * filtro bajo la relación nombrada que la query usa.
 *
 * Ejemplo:
 *   const scope = await scopeWhereAfiliacionRel('afiliacion');
 *   const rows = await prisma.cobroAliado.findMany({
 *     where: { ...scope },
 *   });
 *
 * Devuelve `{}` para STAFF, `{ <rel>: { cotizante: { sucursalId } } }`
 * para SUCURSAL, y `{ <rel>: { asesorComercialId, cotizante: { sucursalId } } }`
 * para ASESOR.
 */
export async function scopeWhereAfiliacionRel<K extends string>(
  relacion: K,
): Promise<Record<K, Prisma.AfiliacionWhereInput> | Record<string, never>> {
  const fragment = await scopeWhereAfiliacion();
  if (Object.keys(fragment).length === 0) return {};
  return { [relacion]: fragment } as Record<K, Prisma.AfiliacionWhereInput>;
}

/**
 * Sprint Asesor Comercial — helper para forzar el `asesorComercialId`
 * en server actions de creación/edición de Afiliacion. Si el rol es
 * ASESOR_COMERCIAL devuelve el suyo (ignora lo que llegue del cliente);
 * para los demás roles devuelve `propuesto` o null si no se pasó.
 *
 * Uso:
 *   const asesorComercialId = await resolverAsesorComercialEnCreacion(
 *     formData.get('asesorComercialId'),
 *   );
 *   await prisma.afiliacion.create({ data: { ..., asesorComercialId } });
 */
export async function resolverAsesorComercialEnCreacion(
  propuesto: string | null | undefined,
): Promise<string | null> {
  const s = await getUserScope();
  if (s?.tipo === 'ASESOR') return s.asesorComercialId;
  return propuesto ?? null;
}
