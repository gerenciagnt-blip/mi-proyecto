/**
 * Catálogo de módulos y acciones para el sistema de permisos.
 * Los módulos son strings planos (no enum) para permitir agregar/quitar
 * sin migraciones. Las acciones son un set fijo.
 */

export const ACCIONES = ['VER', 'CREAR', 'EDITAR', 'ELIMINAR'] as const;
export type Accion = (typeof ACCIONES)[number];

export type ModuloDef = {
  key: string;
  label: string;
  grupo: string;
};

export const MODULOS: readonly ModuloDef[] = [
  // Configuración
  { key: 'config.sucursales', label: 'Sucursales', grupo: 'Configuración' },
  { key: 'config.usuarios', label: 'Usuarios', grupo: 'Configuración' },
  { key: 'config.roles', label: 'Roles', grupo: 'Configuración' },
  { key: 'config.empresas_planilla', label: 'Empresas planilla', grupo: 'Configuración' },
  { key: 'config.empresas_cc', label: 'Empresas CC', grupo: 'Configuración' },
  { key: 'config.catalogos', label: 'Catálogos', grupo: 'Configuración' },

  // Soporte
  { key: 'soporte.afiliaciones', label: 'Afiliaciones', grupo: 'Soporte' },
  { key: 'soporte.incapacidades', label: 'Incapacidades', grupo: 'Soporte' },

  // Operación
  { key: 'base_datos', label: 'Base de datos', grupo: 'Operación' },
  { key: 'transacciones', label: 'Transacciones', grupo: 'Operación' },
  { key: 'planos', label: 'Planos', grupo: 'Operación' },

  // Administrativo
  { key: 'admin.cartera', label: 'Cartera', grupo: 'Administrativo' },
  { key: 'admin.incapacidades', label: 'Incapacidades', grupo: 'Administrativo' },
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
