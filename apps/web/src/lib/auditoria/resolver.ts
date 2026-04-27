import { prisma } from '@pila/db';

/**
 * Resolución en lote de IDs internos (cuids) a etiquetas legibles
 * para mostrar en la bitácora en lugar de los hashes feos
 * `cmogijpl2000o7kwg7d456m3k` que no le dicen nada al operador.
 *
 * **Estrategia híbrida** (decidida con operador):
 *
 * 1. Server-side al cargar la página: tomamos los IDs principales de
 *    cada evento (entidadId) + los IDs que aparecen en `cambios.
 *    antes/despues` con sufijo `Id` (cotizanteId, arlId, epsId, etc.)
 *    Hacemos batch queries (uno por tipo) y devolvemos un Map global.
 *
 * 2. El Map se pasa a la tabla y al modal como prop. Cuando el
 *    operador abre el modal, los IDs ya están resueltos sin re-fetch.
 *
 * Esto es más eficiente que resolver on-demand porque cada modal
 * abriría 5-10 queries chicas. Aquí hacemos 6 queries grandes (con
 * `IN`) para TODA la página visible.
 *
 * Tipos cubiertos:
 *   - Empresa: NIT + razón social
 *   - Cotizante: nombres + tipo+nro doc
 *   - Afiliacion: nombres + doc del cotizante asociado
 *   - EntidadSgss (ARL/EPS/AFP/CCF): nombre + código + tipo
 *   - User: nombre + email
 *   - Sucursal: código + nombre
 *
 * IDs de tipos no soportados caen al fallback `#xxxxxx` o al JSON
 * crudo si están en `cambios`.
 */

export type EntidadResuelta = {
  /** Texto principal (nombre, razón social, etc.) */
  label: string;
  /** Texto secundario (NIT, documento, código). Opcional. */
  sublabel?: string;
  /** Documento del cotizante si aplica — para filtrar bitácora por
   *  número de documento. */
  documento?: string;
};

/** Map de id → datos resueltos. */
export type ResolverMap = Map<string, EntidadResuelta>;

/**
 * Inspecciona un objeto `cambios.antes` o `cambios.despues` buscando
 * campos que terminen en `Id` (sufijo común para foreign keys en el
 * schema). Devuelve un Map de tipo de entidad → Set de ids encontrados.
 *
 * Heurística simple basada en convención de nombres:
 *   - cotizanteId → Cotizante
 *   - arlId / epsId / afpId / ccfId → EntidadSgss
 *   - empresaId → Empresa
 *   - sucursalId → Sucursal
 *   - userId → User
 *
 * No persigue IDs en arrays ni objetos anidados — solo top-level del
 * snapshot. Suficiente para nuestros casos (todos los modelos audited
 * son flat).
 */
function extraerIdsDeCambios(cambios: unknown): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!cambios || typeof cambios !== 'object') return out;
  const c = cambios as Record<string, unknown>;
  const fuentes = [c.antes, c.despues];
  for (const fuente of fuentes) {
    if (!fuente || typeof fuente !== 'object') continue;
    const obj = fuente as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val !== 'string') continue;
      if (val.length < 12) continue; // los cuids son ≥ 24 chars
      const tipo = nombreCampoATipoEntidad(key);
      if (!tipo) continue;
      if (!out.has(tipo)) out.set(tipo, new Set());
      out.get(tipo)!.add(val);
    }
  }
  return out;
}

/** Mapea nombre de campo (cotizanteId) a tipo de entidad (Cotizante). */
function nombreCampoATipoEntidad(campo: string): string | null {
  const k = campo.toLowerCase();
  if (k === 'cotizanteid') return 'Cotizante';
  if (k === 'afiliacionid') return 'Afiliacion';
  if (k === 'empresaid') return 'Empresa';
  if (k === 'sucursalid') return 'Sucursal';
  if (k === 'userid') return 'User';
  if (k === 'arlid' || k === 'epsid' || k === 'afpid' || k === 'ccfid') return 'EntidadSgss';
  return null;
}

/**
 * Resolución en lote para un set de eventos de bitácora.
 *
 * Recolecta IDs principales (entidad + entidadId) e IDs encontrados
 * dentro de `cambios.antes/despues`, agrupa por tipo y dispara una
 * query por tipo con `id IN (...)`. Devuelve el Map global.
 */
export async function resolverEntidadesEnLote(
  eventos: Array<{ entidad: string; entidadId: string; cambios: unknown }>,
): Promise<ResolverMap> {
  const map: ResolverMap = new Map();

  // Agrupar IDs por tipo de entidad
  const porTipo = new Map<string, Set<string>>();
  const agregar = (tipo: string, id: string) => {
    if (!porTipo.has(tipo)) porTipo.set(tipo, new Set());
    porTipo.get(tipo)!.add(id);
  };

  for (const ev of eventos) {
    agregar(ev.entidad, ev.entidadId);
    const idsExtra = extraerIdsDeCambios(ev.cambios);
    for (const [tipo, ids] of idsExtra) {
      for (const id of ids) agregar(tipo, id);
    }
  }

  // Helper para deduplicar trabajo si una entidad aparece en varios eventos
  const ids = (tipo: string): string[] => Array.from(porTipo.get(tipo) ?? []);

  // Cargas en paralelo
  await Promise.all([
    ids('Empresa').length > 0 &&
      (async () => {
        const rows = await prisma.empresa.findMany({
          where: { id: { in: ids('Empresa') } },
          select: { id: true, nit: true, nombre: true },
        });
        for (const r of rows) {
          map.set(r.id, { label: r.nombre, sublabel: `NIT ${r.nit}` });
        }
      })(),
    ids('Cotizante').length > 0 &&
      (async () => {
        const rows = await prisma.cotizante.findMany({
          where: { id: { in: ids('Cotizante') } },
          select: {
            id: true,
            primerNombre: true,
            primerApellido: true,
            tipoDocumento: true,
            numeroDocumento: true,
          },
        });
        for (const r of rows) {
          map.set(r.id, {
            label: `${r.primerNombre} ${r.primerApellido}`.trim(),
            sublabel: `${r.tipoDocumento} ${r.numeroDocumento}`,
            documento: r.numeroDocumento,
          });
        }
      })(),
    ids('Afiliacion').length > 0 &&
      (async () => {
        const rows = await prisma.afiliacion.findMany({
          where: { id: { in: ids('Afiliacion') } },
          select: {
            id: true,
            cotizante: {
              select: {
                primerNombre: true,
                primerApellido: true,
                tipoDocumento: true,
                numeroDocumento: true,
              },
            },
          },
        });
        for (const r of rows) {
          map.set(r.id, {
            label: `${r.cotizante.primerNombre} ${r.cotizante.primerApellido}`.trim(),
            sublabel: `${r.cotizante.tipoDocumento} ${r.cotizante.numeroDocumento}`,
            documento: r.cotizante.numeroDocumento,
          });
        }
      })(),
    ids('EntidadSgss').length > 0 &&
      (async () => {
        const rows = await prisma.entidadSgss.findMany({
          where: { id: { in: ids('EntidadSgss') } },
          select: { id: true, codigo: true, nombre: true, tipo: true },
        });
        for (const r of rows) {
          map.set(r.id, { label: r.nombre, sublabel: `${r.tipo} · ${r.codigo}` });
        }
      })(),
    ids('User').length > 0 &&
      (async () => {
        const rows = await prisma.user.findMany({
          where: { id: { in: ids('User') } },
          select: { id: true, name: true, email: true },
        });
        for (const r of rows) {
          map.set(r.id, { label: r.name ?? '(sin nombre)', sublabel: r.email ?? undefined });
        }
      })(),
    ids('Sucursal').length > 0 &&
      (async () => {
        const rows = await prisma.sucursal.findMany({
          where: { id: { in: ids('Sucursal') } },
          select: { id: true, codigo: true, nombre: true },
        });
        for (const r of rows) {
          map.set(r.id, { label: r.nombre, sublabel: r.codigo });
        }
      })(),
  ]);

  return map;
}

/**
 * Para serializar el Map a JSON cuando se lo pasamos al cliente
 * (modal). Los Map nativos no son JSON-serializables.
 */
export function serializarResolver(map: ResolverMap): Record<string, EntidadResuelta> {
  return Object.fromEntries(map);
}

/**
 * Helper para mostrar una entidad: si está en el map, muestra
 * `label + sublabel`. Si no, fallback a `#xxxxxx` (últimos 6 chars
 * del id como hoy).
 */
export function etiquetaEntidad(
  id: string,
  map: ResolverMap | Record<string, EntidadResuelta>,
): { label: string; sublabel?: string; resuelto: boolean } {
  const r = map instanceof Map ? map.get(id) : map[id];
  if (r) return { label: r.label, sublabel: r.sublabel, resuelto: true };
  return { label: `#${id.slice(-6)}`, resuelto: false };
}
