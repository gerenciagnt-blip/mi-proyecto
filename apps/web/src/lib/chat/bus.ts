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
import { getRedisChatBus } from './bus-redis';

export type { ChatBus, ChatEvent, Subscriber } from './bus-types';

const globalForFactory = globalThis as unknown as { __pilaChatBus?: ChatBus };

/**
 * Resuelve el bus a usar:
 *   - Si `REDIS_URL` está seteado → instancia `RedisChatBus` (que abre
 *     2 conexiones a Redis al primer uso). Si Redis está caído, los
 *     callbacks del cliente ioredis loguean error pero el factory NO
 *     falla — los publish quedan encolados hasta que reconecte.
 *   - Si no → `MemoryChatBus` (sin dependencia de Redis).
 *
 * Aunque ambas implementaciones se importan estáticamente, el código
 * de `ioredis` solo se EJECUTA cuando entramos a `getRedisChatBus()`.
 * El costo es un import resuelto en el bundle del server (sin impacto
 * en el cliente).
 *
 * Cacheado en `globalThis` para sobrevivir HMR de Next dev — sino cada
 * recarga pierde subscriptores y los streams quedan colgando.
 */
export function getChatBus(): ChatBus {
  if (globalForFactory.__pilaChatBus) return globalForFactory.__pilaChatBus;

  if (process.env.REDIS_URL) {
    try {
      globalForFactory.__pilaChatBus = getRedisChatBus(process.env.REDIS_URL);
      return globalForFactory.__pilaChatBus;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        '[chat-bus] REDIS_URL seteado pero RedisChatBus falló al iniciar, usando MemoryChatBus.',
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
