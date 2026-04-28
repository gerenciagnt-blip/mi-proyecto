/**
 * Catálogo de módulos y acciones para el sistema de permisos.
 * Los módulos son strings planos (no enum) para permitir agregar/quitar
 * sin migraciones. Las acciones son un set fijo.
 *
 * Sprint Soporte reorg fase 2 — actualizamos la matriz para reflejar
 * las nuevas secciones que se agregaron en el sprint:
 *   Configuración → Bitácora, Bot Colpatria, Sistema, Asesores
 *                   comerciales, Servicios adicionales, Formato
 *                   comprobante (estaban en el menú pero no en el
 *                   catálogo de permisos).
 *   Soporte       → Cartera y los 3 sub-módulos de Finanzas (Cobro
 *                   Aliados, Movimientos Incapacidades, Detalle
 *                   Movimientos).
 *
 * Cada módulo declara opcionalmente `rolesAplica` para limitar a qué
 * roles del sistema le aplica (si se omite, aplica a todos). Los
 * módulos staff-only (Bitácora, Bot Colpatria, Sistema, Soporte/*)
 * no aparecen en la matriz de aliados — antes la matriz mostraba
 * todos los checkboxes para todos los roles, lo cual confundía.
 *
 * Compat: agregar entradas no rompe filas existentes en la tabla
 * `Permiso` (modulo es String). Los nuevos módulos arrancan sin check
 * para todos los roles → comportamiento conservador.
 */

import type { Role } from '@pila/db';

export const ACCIONES = ['VER', 'CREAR', 'EDITAR', 'ELIMINAR'] as const;
export type Accion = (typeof ACCIONES)[number];

export type ModuloDef = {
  key: string;
  label: string;
  grupo: string;
  /**
   * Roles del sistema a los que aplica este módulo. Omitido ⇒ aplica
   * a todos (ADMIN, SOPORTE, ALIADO_OWNER, ALIADO_USER). ADMIN siempre
   * tiene todo, no se filtra acá.
   */
  rolesAplica?: Role[];
};

/** Solo STAFF (ADMIN/SOPORTE) — usado para módulos backoffice. */
const STAFF: Role[] = ['ADMIN', 'SOPORTE'];
/** Solo ADMIN — operaciones internas/sistema. */
const ADMIN_ONLY: Role[] = ['ADMIN'];

export const MODULOS: readonly ModuloDef[] = [
  // ========================= Configuración =========================
  // Catálogos / sub-tabs internas — administrables por staff.
  { key: 'config.sucursales', label: 'Sucursales', grupo: 'Configuración', rolesAplica: STAFF },
  { key: 'config.usuarios', label: 'Usuarios', grupo: 'Configuración', rolesAplica: STAFF },
  { key: 'config.roles', label: 'Roles y permisos', grupo: 'Configuración', rolesAplica: STAFF },
  {
    key: 'config.empresas_planilla',
    label: 'Empresas planilla',
    grupo: 'Configuración',
    rolesAplica: STAFF,
  },
  // Empresas CC se ve en aliado también (Receipt en el nav sin restricción).
  { key: 'config.empresas_cc', label: 'Empresas CC' /* visible a todos */, grupo: 'Configuración' },
  {
    key: 'config.catalogos',
    label: 'Parametrización',
    grupo: 'Configuración',
    rolesAplica: STAFF,
  },
  // Asesor comercial / servicios adicionales / formato comprobante son
  // catálogos visibles en aliado también (íconos sin restricción de rol).
  {
    key: 'config.asesores_comerciales',
    label: 'Asesor comercial',
    grupo: 'Configuración',
  },
  {
    key: 'config.servicios_adicionales',
    label: 'Servicios adicionales',
    grupo: 'Configuración',
  },
  {
    key: 'config.formato_comprobante',
    label: 'Formato comprobante',
    grupo: 'Configuración',
  },
  // Bitácora staff + dueño aliado (ALIADO_USER no la ve).
  {
    key: 'config.bitacora',
    label: 'Bitácora',
    grupo: 'Configuración',
    rolesAplica: ['ADMIN', 'SOPORTE', 'ALIADO_OWNER'],
  },
  {
    key: 'config.colpatria_jobs',
    label: 'Bot Colpatria',
    grupo: 'Configuración',
    rolesAplica: STAFF,
  },
  { key: 'config.sistema', label: 'Sistema', grupo: 'Configuración', rolesAplica: ADMIN_ONLY },

  // ========================= Soporte =========================
  // Todo el módulo Soporte es staff-only.
  { key: 'soporte.cartera', label: 'Cartera', grupo: 'Soporte', rolesAplica: STAFF },
  { key: 'soporte.afiliaciones', label: 'Afiliaciones', grupo: 'Soporte', rolesAplica: STAFF },
  { key: 'soporte.incapacidades', label: 'Incapacidades', grupo: 'Soporte', rolesAplica: STAFF },
  // Sprint Jurídico — bandeja con casos derivados a área legal. Visible
  // a TODO STAFF (cualquier soporte ve la sección y los listados).
  { key: 'soporte.juridico', label: 'Jurídico', grupo: 'Soporte', rolesAplica: STAFF },
  // Permiso de privacidad — solo los users con este permiso pueden
  // DESCARGAR documentos marcados como confidenciales en el flujo
  // jurídico. Los demás staff ven que el documento existe en el listado
  // pero el botón de descarga aparece bloqueado. ADMIN siempre puede
  // (regla del sistema). Para SOPORTE, requiere RolCustom específico.
  {
    key: 'soporte.juridico_confidencial',
    label: 'Jurídico · descargar documentos confidenciales',
    grupo: 'Soporte',
    rolesAplica: STAFF,
  },
  {
    key: 'soporte.finanzas.cobro_aliados',
    label: 'Finanzas · Cobro aliados',
    grupo: 'Soporte',
    rolesAplica: STAFF,
  },
  {
    key: 'soporte.finanzas.movimientos_incapacidades',
    label: 'Finanzas · Movimientos incapacidades',
    grupo: 'Soporte',
    rolesAplica: STAFF,
  },
  {
    key: 'soporte.finanzas.detalle_movimientos',
    label: 'Finanzas · Detalle movimientos',
    grupo: 'Soporte',
    rolesAplica: STAFF,
  },

  // ========================= Operación =========================
  // Operación es transversal: aliado y staff la usan.
  { key: 'base_datos', label: 'Base de datos', grupo: 'Operación' },
  { key: 'transacciones', label: 'Transacciones', grupo: 'Operación' },
  { key: 'planos', label: 'Planos', grupo: 'Operación' },

  // ========================= Administrativo =========================
  // Solo aliado (la ve scopeada a su sucursal). Staff ve la versión
  // global desde Soporte.
  {
    key: 'admin.cartera',
    label: 'Cartera',
    grupo: 'Administrativo',
    rolesAplica: ['ALIADO_OWNER', 'ALIADO_USER'],
  },
  {
    key: 'admin.incapacidades',
    label: 'Incapacidades',
    grupo: 'Administrativo',
    rolesAplica: ['ALIADO_OWNER', 'ALIADO_USER'],
  },
] as const;

/** Agrupa los módulos por su campo `grupo` preservando el orden. */
export function agruparModulos(): { grupo: string; modulos: ModuloDef[] }[] {
  const map = new Map<string, ModuloDef[]>();
  const orden: string[] = [];
  for (const m of MODULOS) {
    let arr = map.get(m.grupo);
    if (!arr) {
      arr = [];
      map.set(m.grupo, arr);
      orden.push(m.grupo);
    }
    arr.push(m);
  }
  return orden.map((grupo) => ({
    grupo,
    modulos: map.get(grupo) ?? [],
  }));
}

/**
 * Sprint Soporte reorg fase 2 — versión filtrada por rol del usuario
 * cuyos permisos se están editando. Esconde grupos vacíos resultantes.
 *
 * Si `role` es null/undefined, devuelve todos los módulos (vista
 * completa para casos administrativos).
 */
export function agruparModulosPorRol(
  role: Role | null | undefined,
): { grupo: string; modulos: ModuloDef[] }[] {
  if (!role) return agruparModulos();
  const filtrados = MODULOS.filter((m) => !m.rolesAplica || m.rolesAplica.includes(role));
  const map = new Map<string, ModuloDef[]>();
  const orden: string[] = [];
  for (const m of filtrados) {
    let arr = map.get(m.grupo);
    if (!arr) {
      arr = [];
      map.set(m.grupo, arr);
      orden.push(m.grupo);
    }
    arr.push(m);
  }
  return orden.map((grupo) => ({
    grupo,
    modulos: map.get(grupo) ?? [],
  }));
}
