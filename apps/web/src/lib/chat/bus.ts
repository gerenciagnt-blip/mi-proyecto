/**
 * Sprint Chat · SSE — bus in-memory para pub/sub de eventos del chat.
 *
 * Las server actions del chat (`enviarMensaje`, `marcarLeido`, `cerrar`,
 * `reabrir`) publican eventos por `userId`; el route handler
 * `/api/chat/stream` se suscribe para cada cliente conectado y reenvía
 * por SSE.
 *
 * Diseño:
 *   - In-memory por instancia. Si la app corre con >1 instancia, un
 *     mensaje creado en instance A no llega a clientes en instance B.
 *     **Mitigación**: el cliente conserva polling SWR cada 30s como
 *     fallback, así el peor caso es "no llega instant" pero llega en
 *     <30s.
 *   - Cuando escalemos a Redis, sustituir las funciones export por la
 *     misma API encima de `redis.publish/subscribe`.
 *   - `globalThis` para sobrevivir HMR de Next dev — sino cada reload
 *     pierde subscriptores y los streams se cuelgan.
 */

export type ChatEvent =
  | { tipo: 'mensaje'; conversacionId: string }
  | { tipo: 'conv-updated'; conversacionId: string }
  | { tipo: 'presencia' };

type Subscriber = (ev: ChatEvent) => void;

type Bus = {
  subs: Map<string, Set<Subscriber>>;
};

const globalForBus = globalThis as unknown as { __pilaChatBus?: Bus };

function getBus(): Bus {
  if (!globalForBus.__pilaChatBus) {
    globalForBus.__pilaChatBus = { subs: new Map() };
  }
  return globalForBus.__pilaChatBus;
}

/**
 * Suscribe al user al bus. Devuelve la función de unsubscribe para
 * llamar cuando el stream se cierre.
 */
export function subscribe(userId: string, cb: Subscriber): () => void {
  const bus = getBus();
  let set = bus.subs.get(userId);
  if (!set) {
    set = new Set();
    bus.subs.set(userId, set);
  }
  set.add(cb);
  return () => {
    const s = bus.subs.get(userId);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) bus.subs.delete(userId);
  };
}

/**
 * Publica un evento al user. Fire-and-forget — si no hay subscriptores
 * (user sin sesiones abiertas), no hace nada.
 */
export function publish(userId: string, ev: ChatEvent): void {
  const subs = getBus().subs.get(userId);
  if (!subs || subs.size === 0) return;
  for (const cb of subs) {
    try {
      cb(ev);
    } catch {
      // Silenciar: un subscriber roto no debe afectar a los demás.
    }
  }
}

/**
 * Publica el mismo evento a múltiples users de una sola pasada. Útil
 * para mensajes que afectan a todos los participantes de una conv.
 */
export function publishMany(userIds: string[], ev: ChatEvent): void {
  for (const uid of userIds) publish(uid, ev);
}

/**
 * Cantidad de subscriptores activos. Usado por el endpoint de health
 * para diagnosticar fugas.
 */
export function debugStats(): { users: number; totalSubs: number } {
  const bus = getBus();
  let total = 0;
  for (const s of bus.subs.values()) total += s.size;
  return { users: bus.subs.size, totalSubs: total };
}
