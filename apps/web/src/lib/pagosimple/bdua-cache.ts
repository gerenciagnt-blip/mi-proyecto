/**
 * Cache in-memory de respuestas BDUA/RUAF — reduce llamadas a PagoSimple
 * y mejora la latencia de la UX (cache hit ≈ 1ms vs ~2-3s de la consulta
 * real al operador).
 *
 * Caso de uso:
 *   Con 70 aliados afiliando concurrentemente, el mismo cotizante puede
 *   consultarse varias veces en una hora (recargas, dual-check del jefe,
 *   distintos aliados sobre la misma persona). Sin cache, cada consulta
 *   pega a PagoSimple.
 *
 * Diseño:
 *   - TTL 30 min: BDUA/RUAF cambia con novedades de afiliación (ritmo
 *     semanal/mensual del propio sistema), 30 min es totalmente seguro.
 *   - LRU implícito limitado a `MAX_ENTRIES` (default 5000) para evitar
 *     leak de memoria si un atacante itera documentos.
 *   - Bypass explícito vía `forceFresh=true` cuando el operador quiere
 *     consulta sin cache (botón "Refrescar" en UI).
 *
 * Caveat — multi-instancia (Vercel serverless):
 *   Cada lambda tiene su propia memoria. La efectividad del cache depende
 *   de la stickiness del routing. En la práctica con Vercel `regions:
 *   ['iad1']` y warm starts, varios requests del mismo aliado tienden a
 *   caer en la misma lambda → buena tasa de hit. Si crecemos mucho,
 *   migrar a Upstash Redis (cambio mínimo: reemplazar `Map` por cliente
 *   `@upstash/redis`).
 */

import type { BduaRuafItem } from './types';

type CacheEntry = {
  value: BduaRuafItem | null;
  expiresAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 5000;

const cache = new Map<string, CacheEntry>();

function cacheKey(tipo: string, num: string): string {
  return `${tipo.trim().toUpperCase()}:${num.trim()}`;
}

/**
 * Obtiene una entrada cacheada si está vigente. Devuelve `undefined`
 * para indicar "miss" (nunca consultado), o el `value` que puede ser
 * `null` (consultado pero sin registro en BDUA — también es info válida
 * a cachear para no re-preguntar por personas inexistentes).
 */
export function getBduaCached(tipo: string, num: string): BduaRuafItem | null | undefined {
  const k = cacheKey(tipo, num);
  const entry = cache.get(k);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(k);
    return undefined;
  }
  // LRU: re-insertar para mover al final del orden de inserción.
  cache.delete(k);
  cache.set(k, entry);
  return entry.value;
}

/**
 * Guarda una respuesta en cache. Aplica eviction LRU naive si supera
 * `MAX_ENTRIES` (borra la más vieja insertada).
 */
export function setBduaCached(tipo: string, num: string, value: BduaRuafItem | null): void {
  if (cache.size >= MAX_ENTRIES) {
    // Borra el primer elemento del Map (el más viejo en orden de inserción).
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(cacheKey(tipo, num), {
    value,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Invalida una entrada específica — útil cuando el operador clickea
 * "Refrescar" en UI sabiendo que el dato cambió.
 */
export function invalidateBduaCached(tipo: string, num: string): void {
  cache.delete(cacheKey(tipo, num));
}

/**
 * Stats para debug y observabilidad. NO depende de la lógica del cache.
 * Útil en `/api/health` o un endpoint de stats si se quiere exponer.
 */
export function bduaCacheStats(): { size: number; maxEntries: number; ttlMs: number } {
  return { size: cache.size, maxEntries: MAX_ENTRIES, ttlMs: TTL_MS };
}
