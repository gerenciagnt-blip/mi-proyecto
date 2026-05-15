import type { ChatBus, ChatEvent, Subscriber } from './bus-types';

/**
 * Implementación in-memory del bus. La que se usaba en el sprint
 * original — sigue siendo el default cuando `REDIS_URL` no está.
 *
 * Limitación documentada: no escala a >1 instancia. Para multi-instancia
 * usar el adapter Redis (`bus-redis.ts`).
 */

type State = {
  subs: Map<string, Set<Subscriber>>;
};

const globalForState = globalThis as unknown as { __pilaChatBusMem?: State };

function getState(): State {
  if (!globalForState.__pilaChatBusMem) {
    globalForState.__pilaChatBusMem = { subs: new Map() };
  }
  return globalForState.__pilaChatBusMem;
}

export function getMemoryChatBus(): ChatBus {
  const state = getState();

  return {
    transport: 'memory',

    subscribe(userId, cb) {
      let set = state.subs.get(userId);
      if (!set) {
        set = new Set();
        state.subs.set(userId, set);
      }
      set.add(cb);
      return () => {
        const s = state.subs.get(userId);
        if (!s) return;
        s.delete(cb);
        if (s.size === 0) state.subs.delete(userId);
      };
    },

    publish(userId, ev) {
      const subs = state.subs.get(userId);
      if (!subs || subs.size === 0) return;
      for (const cb of subs) {
        try {
          cb(ev);
        } catch {
          // Silenciar: un subscriber roto no debe afectar a los demás.
        }
      }
    },

    publishMany(userIds, ev) {
      for (const uid of userIds) {
        const subs = state.subs.get(uid);
        if (!subs || subs.size === 0) continue;
        for (const cb of subs) {
          try {
            cb(ev);
          } catch {
            // ignorar
          }
        }
      }
    },

    debugStats() {
      let total = 0;
      for (const s of state.subs.values()) total += s.size;
      return { users: state.subs.size, totalSubs: total };
    },
  };
}
