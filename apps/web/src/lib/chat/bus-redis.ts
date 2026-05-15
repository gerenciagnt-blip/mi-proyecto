import Redis from 'ioredis';
import type { ChatBus, ChatEvent, Subscriber } from './bus-types';

/**
 * Sprint Chat · SSE — implementación Redis del bus. Permite que el
 * chat funcione coherente en múltiples instancias del backend
 * (Vercel functions, DO App Platform workers, replicas k8s, etc.).
 *
 * Arquitectura:
 *   - DOS conexiones Redis por proceso:
 *     1. `subscriber`: conexión dedicada que se suscribe al patrón
 *        `chat:user:*`. Recibe TODOS los eventos del cluster.
 *     2. `publisher`: conexión normal para `PUBLISH chat:user:<uid>`.
 *     Esto es la práctica estándar — un cliente Redis en modo
 *     subscribe no acepta otros comandos.
 *   - Mapa local `userId → Set<Subscriber>` para entregar los eventos
 *     recibidos solo a los subs del proceso actual. Esto evita
 *     procesar eventos para users no conectados acá.
 *
 * Canal: `chat:user:<userId>` con payload JSON del evento.
 *
 * Reconexión: `ioredis` la maneja automáticamente con backoff
 * exponencial. Los suscritos sobreviven a la reconexión.
 */

type State = {
  subscriber: Redis;
  publisher: Redis;
  subs: Map<string, Set<Subscriber>>;
  ready: boolean;
};

const globalForState = globalThis as unknown as { __pilaChatBusRedis?: State };

const PATTERN = 'chat:user:*';

function buildState(url: string): State {
  // Configuración común — ioredis lee la mayoría del URI. Lazy connect
  // false para detectar errores de URL al instanciar.
  const opts = {
    maxRetriesPerRequest: null, // permite reconexión indefinida para subscriber
    enableReadyCheck: true,
  } as const;

  const subscriber = new Redis(url, opts);
  const publisher = new Redis(url, opts);

  const state: State = {
    subscriber,
    publisher,
    subs: new Map(),
    ready: false,
  };

  // Una sola pattern subscribe — el cluster nos entrega todo y filtramos local.
  subscriber.psubscribe(PATTERN).then(
    () => {
      state.ready = true;
      // eslint-disable-next-line no-console
      console.log('[chat-bus] Redis subscriber ready, pattern:', PATTERN);
    },
    (err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[chat-bus] Redis psubscribe falló:', err);
    },
  );

  subscriber.on('pmessage', (_pattern, channel, message) => {
    // channel = `chat:user:<userId>`
    const userId = channel.slice('chat:user:'.length);
    const subs = state.subs.get(userId);
    if (!subs || subs.size === 0) return;
    let ev: ChatEvent;
    try {
      ev = JSON.parse(message) as ChatEvent;
    } catch {
      return; // payload corrupto, ignorar
    }
    for (const cb of subs) {
      try {
        cb(ev);
      } catch {
        // ignorar errores de subscriber
      }
    }
  });

  subscriber.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.warn('[chat-bus] Redis subscriber error:', err.message);
  });
  publisher.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.warn('[chat-bus] Redis publisher error:', err.message);
  });

  return state;
}

export function getRedisChatBus(url: string): ChatBus {
  if (!globalForState.__pilaChatBusRedis) {
    globalForState.__pilaChatBusRedis = buildState(url);
  }
  const state = globalForState.__pilaChatBusRedis;

  return {
    transport: 'redis',

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
      // Fire-and-forget — `ioredis` encola si la conexión está caída
      // y reenvía al reconectar. No esperamos confirmación.
      void state.publisher.publish(`chat:user:${userId}`, JSON.stringify(ev)).catch(() => {});
    },

    publishMany(userIds, ev) {
      const payload = JSON.stringify(ev);
      // Pipeline para enviar todos los PUBLISH en un solo round-trip.
      const pipeline = state.publisher.pipeline();
      for (const uid of userIds) {
        pipeline.publish(`chat:user:${uid}`, payload);
      }
      void pipeline.exec().catch(() => {});
    },

    debugStats() {
      let total = 0;
      for (const s of state.subs.values()) total += s.size;
      return { users: state.subs.size, totalSubs: total };
    },
  };
}
