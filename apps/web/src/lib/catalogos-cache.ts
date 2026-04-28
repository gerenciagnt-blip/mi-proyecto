/**
 * Catálogos cacheados — datos del dominio que NO cambian dentro de un día
 * típico (entidades SGSS, DIVIPOLA, planes, etc.) y que se leen en CADA
 * request de varias páginas admin.
 *
 * Cómo funciona:
 *   - `unstable_cache` de Next.js cachea el resultado a nivel de servidor.
 *   - El `key` (segundo arg) identifica la entrada; cambiando el key se
 *     invalida.
 *   - `revalidate` en segundos define el TTL automático.
 *   - `tags` permite invalidación manual desde server actions tras editar
 *     un catálogo: `revalidateTag('catalogo:entidades')`.
 *
 * IMPORTANTE: solo cachear queries DETERMINÍSTICAS (sin filtros que
 * cambien por user/scope/searchParam). Si la query depende del usuario,
 * NO usar este módulo — usar `cache()` de React si el deduping intra-
 * request alcanza.
 *
 * TTLs elegidos por estabilidad real del dato:
 *   - Catálogos oficiales (DIVIPOLA, EPS/AFP/ARL/CCF, planes, actividades):
 *     12h. Si cambia, el operador puede `revalidateTag` manual.
 *   - SMLV singleton: 24h. Cambia una vez al año.
 *   - Tipos de cotizante: 12h. Cambia muy raro.
 */

import { unstable_cache } from 'next/cache';
import { prisma } from '@pila/db';

const TWELVE_HOURS = 12 * 60 * 60;
const ONE_DAY = 24 * 60 * 60;

/**
 * Etiquetas para invalidación manual desde server actions tras editar
 * un catálogo (ej: agregar EPS, actualizar SMLV).
 */
export const CATALOGO_TAGS = {
  tiposCotizante: 'catalogo:tipos-cotizante',
  departamentos: 'catalogo:departamentos',
  entidades: 'catalogo:entidades',
  actividades: 'catalogo:actividades',
  planes: 'catalogo:planes',
  smlv: 'catalogo:smlv',
} as const;

/**
 * Tipos de cotizante con sus subtipos (Dependiente, Independiente, etc.).
 * Lo usa el form de afiliación para poblar el select de tipo + subtipo
 * dependiente.
 */
export const getTiposCotizanteCached = unstable_cache(
  async () => {
    return prisma.tipoCotizante.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      include: {
        subtipos: {
          where: { active: true },
          orderBy: { codigo: 'asc' },
          select: { id: true, codigo: true, nombre: true },
        },
      },
    });
  },
  ['catalogo:tipos-cotizante:v1'],
  { revalidate: TWELVE_HOURS, tags: [CATALOGO_TAGS.tiposCotizante] },
);

/**
 * Catálogo DANE de departamentos + municipios. ~33 deptos, ~1.100 municipios.
 * El más caro de leer sin caché (196k filas escaneadas según analyze:db).
 */
export const getDepartamentosCached = unstable_cache(
  async () => {
    return prisma.departamento.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        municipios: {
          orderBy: { nombre: 'asc' },
          select: { id: true, nombre: true },
        },
      },
    });
  },
  ['catalogo:departamentos:v1'],
  { revalidate: ONE_DAY, tags: [CATALOGO_TAGS.departamentos] },
);

/**
 * Entidades SGSS (EPS/AFP/ARL/CCF) — ~100 filas pero leídas 1.500+ veces
 * según analyze:db (79.000 filas escaneadas en seq_scan).
 */
export const getEntidadesSgssCached = unstable_cache(
  async () => {
    return prisma.entidadSgss.findMany({
      where: { active: true },
      orderBy: [{ tipo: 'asc' }, { codigo: 'asc' }],
      select: { id: true, tipo: true, codigo: true, nombre: true, codigoMinSalud: true },
    });
  },
  ['catalogo:entidades:v1'],
  { revalidate: TWELVE_HOURS, tags: [CATALOGO_TAGS.entidades] },
);

/**
 * Actividades económicas DIAN (CIIU). Catálogo grande y muy estable.
 */
export const getActividadesEconomicasCached = unstable_cache(
  async () => {
    return prisma.actividadEconomica.findMany({
      where: { active: true },
      orderBy: { codigoCiiu: 'asc' },
      select: { id: true, codigoCiiu: true, descripcion: true },
    });
  },
  ['catalogo:actividades:v1'],
  { revalidate: ONE_DAY, tags: [CATALOGO_TAGS.actividades] },
);

/**
 * Planes SGSS (los servicios que vende cada aliado: contributivo + cesantías,
 * solo riesgo, etc.). Cambia rara vez.
 */
export const getPlanesSgssCached = unstable_cache(
  async () => {
    return prisma.planSgss.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        incluyeEps: true,
        incluyeAfp: true,
        incluyeArl: true,
        incluyeCcf: true,
        regimen: true,
      },
    });
  },
  ['catalogo:planes:v1'],
  { revalidate: TWELVE_HOURS, tags: [CATALOGO_TAGS.planes] },
);

/**
 * SMLV vigente (singleton). Cambia una vez al año por decreto.
 */
export const getSmlvCached = unstable_cache(
  async () => {
    return prisma.smlvConfig.findUnique({ where: { id: 'singleton' } });
  },
  ['catalogo:smlv:v1'],
  { revalidate: ONE_DAY, tags: [CATALOGO_TAGS.smlv] },
);

/**
 * Helper para invalidar uno o varios catálogos desde server actions de
 * `/admin/catalogos/*` cuando el operador edita el catálogo.
 *
 * Uso:
 *   import { invalidarCatalogos, CATALOGO_TAGS } from '@/lib/catalogos-cache';
 *   await invalidarCatalogos(CATALOGO_TAGS.entidades);
 */
export async function invalidarCatalogos(
  ...tags: ReadonlyArray<(typeof CATALOGO_TAGS)[keyof typeof CATALOGO_TAGS]>
): Promise<void> {
  const { revalidateTag } = await import('next/cache');
  for (const t of tags) revalidateTag(t);
}
