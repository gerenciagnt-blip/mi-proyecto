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
   * a todos (ADMIN, SOPORTE, ALIADO_OWNER, ALIADO_USER, ASESOR_COMERCIAL).
   * ADMIN siempre tiene todo, no se filtra acá.
   *
   * Sprint Asesor Comercial — agregamos el rol ASESOR_COMERCIAL. Como
   * "omitido = todos" ahora incluye al asesor, los módulos que NO deben
   * aparecerle (catálogos, cuentas de cobro, transacciones, planos) deben
   * declarar `rolesAplica: NO_ASESOR` o un set más restrictivo.
   */
  rolesAplica?: Role[];
};

/** Solo STAFF (ADMIN/SOPORTE) — usado para módulos backoffice. */
const STAFF: Role[] = ['ADMIN', 'SOPORTE'];
/** Solo ADMIN — operaciones internas/sistema. */
const ADMIN_ONLY: Role[] = ['ADMIN'];
/**
 * Roles "tradicionales" (anteriores a ASESOR_COMERCIAL). Usado en módulos
 * cross-aliado que NO deben aparecer al asesor (catálogos administrativos,
 * cuentas de cobro, transacciones, planos). El asesor solo gestiona lo
 * que está amarrado a él como vendedor — no administra el catálogo.
 */
const NO_ASESOR: Role[] = ['ADMIN', 'SOPORTE', 'ALIADO_OWNER', 'ALIADO_USER'];

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
  // Excluye al ASESOR_COMERCIAL: no administra el catálogo, solo crea
  // afiliaciones contra empresas existentes.
  {
    key: 'config.empresas_cc',
    label: 'Empresas CC',
    grupo: 'Configuración',
    rolesAplica: NO_ASESOR,
  },
  {
    key: 'config.catalogos',
    label: 'Parametrización',
    grupo: 'Configuración',
    rolesAplica: STAFF,
  },
  // Catálogos visibles al aliado tradicional pero NO al ASESOR_COMERCIAL —
  // el asesor no edita el catálogo de asesores ni los servicios/formatos
  // que cobra. Solo "vende" lo que ya está armado.
  {
    key: 'config.asesores_comerciales',
    label: 'Asesor comercial',
    grupo: 'Configuración',
    rolesAplica: NO_ASESOR,
  },
  {
    key: 'config.servicios_adicionales',
    label: 'Servicios adicionales',
    grupo: 'Configuración',
    rolesAplica: NO_ASESOR,
  },
  {
    key: 'config.formato_comprobante',
    label: 'Formato comprobante',
    grupo: 'Configuración',
    rolesAplica: NO_ASESOR,
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
  // Sprint PQRS — bandeja específica dentro de Jurídico para peticiones,
  // quejas, reclamos y sugerencias entrantes desde la landing pública.
  // Solo staff atiende.
  {
    key: 'soporte.juridico.pqrs',
    label: 'Jurídico · PQRS',
    grupo: 'Soporte',
    rolesAplica: STAFF,
  },
  // Sprint Chat · cierre+rating — dashboard de calificaciones que los
  // aliados dejan al cerrar conversaciones con staff. Solo staff lo ve.
  {
    key: 'soporte.calificaciones_chat',
    label: 'Calificaciones chat',
    grupo: 'Soporte',
    rolesAplica: STAFF,
  },
  // Sprint PagoSimple Errores — bandeja de planillas con estado ERROR
  // en validación (inconsistencias UGPP). Solo staff corrige.
  {
    key: 'soporte.planillas_errores',
    label: 'Planillas con errores PagoSimple',
    grupo: 'Soporte',
    rolesAplica: STAFF,
  },

  // ========================= Operación =========================
  // Operación es transversal: aliado y staff la usan.
  // Para ASESOR_COMERCIAL: SOLO se le abre Dashboard, Base de datos
  // (afiliaciones, filtradas a las suyas) y Notificaciones. El resto
  // (Cuentas de cobro, Transacciones, Planos) lo administra el aliado
  // tradicional.
  { key: 'dashboard_ejecutivo', label: 'Dashboard ejecutivo', grupo: 'Operación' },
  { key: 'base_datos', label: 'Base de datos', grupo: 'Operación' },
  {
    key: 'cuentas_cobro',
    label: 'Cuentas de cobro',
    grupo: 'Operación',
    rolesAplica: NO_ASESOR,
  },
  // `transacciones`: el módulo es accesible para todos los roles, incluido
  // ASESOR_COMERCIAL — el asesor ve dentro las sub-tabs "Cartera de
  // cotizantes" e "Historial" filtradas a lo que él gestiona (sus
  // afiliaciones). NO ve "Transacción" (crear) ni "Cuadre de caja".
  { key: 'transacciones', label: 'Transacciones', grupo: 'Operación' },
  { key: 'planos', label: 'Planos', grupo: 'Operación', rolesAplica: NO_ASESOR },
  // Sprint 8.6 — Permiso específico para solicitar el certificado de
  // afiliación vigente desde el modal Consultar de cada afiliación. Si
  // se quita, el botón "Certificado vigente" no debería aparecer.
  // Aplica al mismo set que ve el modal de afiliación (todos los roles
  // con acceso a la afiliación según scope de sucursal).
  {
    key: 'colpatria.certificado_vigente',
    label: 'Bot Colpatria · Certificado vigente',
    grupo: 'Operación',
  },
  // Bandeja de notificaciones del usuario (alertas de cartera, cobros,
  // soportes, jobs Colpatria, etc.). Es personal — cualquier user
  // autenticado ve solo las suyas; el módulo en sí está disponible
  // para todos los roles base.
  { key: 'notificaciones', label: 'Notificaciones', grupo: 'Operación' },
  // Sprint Chat interno — mensajería staff↔aliados (DM/grupos).
  // Disponible para todos los roles base; las reglas de "con quién puedo
  // chatear" viven en lib/chat/elegibles.ts (matriz por rol).
  { key: 'chat', label: 'Chat interno', grupo: 'Operación' },

  // ========================= Administrativo =========================
  // Solo aliado (la ve scopeada a su sucursal). Staff ve la versión
  // global desde Soporte.
  // El ASESOR_COMERCIAL NO ve Cartera (se le dio acceso a "Cartera de
  // cotizantes" en Transacciones, que es la vista propia de su rol).
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
  // Módulo Reporte AT — el aliado radica desde Administrativo, soporte
  // gestiona desde la bandeja paralela `soporte.reporte_at`. El asesor
  // también lo ve (filtrado a los reportes AT de su sucursal).
  {
    key: 'admin.reporte_at',
    label: 'Reporte AT',
    grupo: 'Administrativo',
    rolesAplica: ['ALIADO_OWNER', 'ALIADO_USER', 'ASESOR_COMERCIAL'],
  },
  {
    key: 'soporte.reporte_at',
    label: 'Reporte AT',
    grupo: 'Soporte',
    rolesAplica: STAFF,
  },
  // Sprint Comisiones — vista global de ADMIN para cerrar comisiones por
  // periodo. Vive bajo el grupo Soporte en el navbar para que el ADMIN
  // (staff) lo tenga junto a sus otras bandejas. Solo STAFF (admin)
  // cierra; el asesor accede a su propia vista vía `admin.asesor_comisiones`.
  {
    key: 'admin.comisiones',
    label: 'Comisiones (admin)',
    grupo: 'Soporte',
    rolesAplica: ['ADMIN'],
  },
  {
    key: 'admin.asesor_comisiones',
    label: 'Mis comisiones',
    grupo: 'Asesor',
    rolesAplica: ['ASESOR_COMERCIAL'],
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
