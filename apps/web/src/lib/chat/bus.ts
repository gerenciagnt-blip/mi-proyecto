/**
 * Sprint Chat · SSE — bus pub/sub abstracto con dos transports:
 *
 *   - **MemoryChatBus** (default): pub/sub in-process. Funciona en
 *     desarrollo y producción de UNA sola instancia.
 *   - **RedisChatBus** (opt-in via `REDIS_URL`): pub/sub vía Redis
 *     (Upstash, DO Managed, Redis Cloud, self-hosted). Sirve para
 *     multi-instancia — todos los workers ven los mismos eventos.
 *
 * La API pública (`subscribe`, `publish`, `publishMany`, `debugStats`)
 * es la misma sin importar el transport. Los callers (server actions,
 * route handlers) no saben cuál se usa — el factory `getChatBus()`
 * decide al primer uso según `process.env.REDIS_URL`.
 *
 * Para activar Redis en prod:
 *   1. Aprovisionar instancia (Upstash gratis cubre el flujo interno).
 *   2. Setear `REDIS_URL=rediss://default:<token>@<host>:<port>` en el
 *      App Platform / Vercel env vars.
 *   3. Reiniciar el servicio. No requiere cambios de código.
 */

import type { ChatBus, ChatEvent, Subscriber } from './bus-types';
import { getMemoryChatBus } from './bus-memory';

export type { ChatBus, ChatEvent, Subscriber } from './bus-types';

const globalForFactory = globalThis as unknown as { __pilaChatBus?: ChatBus };

/**
 * Resuelve el bus a usar:
 *   - Si `REDIS_URL` está seteado → carga dinámicamente `bus-redis.ts`
 *     y devuelve `RedisChatBus`. Si la carga falla (módulo ausente o
 *     URL inválida), hace fallback a memory + log de warning.
 *   - Si no → `MemoryChatBus`.
 *
 * Cacheado en `globalThis` para sobrevivir HMR de Next dev — sino cada
 * recarga pierde subscriptores y los streams quedan colgando.
 */
export function getChatBus(): ChatBus {
  if (globalForFactory.__pilaChatBus) return globalForFactory.__pilaChatBus;

  if (process.env.REDIS_URL) {
    try {
      // Dynamic require para evitar cargar `ioredis` en producciones que
      // no usan Redis (tree-shaking no funciona sobre require dinámico
      // de runtime, pero el módulo no se evalúa si no llegamos acá).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getRedisChatBus } = require('./bus-redis') as typeof import('./bus-redis');
      globalForFactory.__pilaChatBus = getRedisChatBus(process.env.REDIS_URL);
      return globalForFactory.__pilaChatBus;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        '[chat-bus] REDIS_URL seteado pero no se pudo cargar RedisChatBus, usando MemoryChatBus.',
        e instanceof Error ? e.message : e,
      );
    }
  }

  globalForFactory.__pilaChatBus = getMemoryChatBus();
  return globalForFactory.__pilaChatBus;
}

// ============ API pública (delegada al bus activo) ============

export function subscribe(userId: string, cb: Subscriber): () => void {
  return getChatBus().subscribe(userId, cb);
}

export function publish(userId: string, ev: ChatEvent): void {
  getChatBus().publish(userId, ev);
}

export function publishMany(userIds: string[], ev: ChatEvent): void {
  getChatBus().publishMany(userIds, ev);
}

export function debugStats(): { users: number; totalSubs: number; transport: string } {
  const bus = getChatBus();
  return { ...bus.debugStats(), transport: bus.transport };
}
