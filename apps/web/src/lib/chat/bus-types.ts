/**
 * Sprint Chat · SSE — tipos compartidos entre los dos transports
 * (memory y redis). Vive en archivo separado para no crear ciclos.
 */

export type ChatEvent =
  | { tipo: 'mensaje'; conversacionId: string }
  | { tipo: 'conv-updated'; conversacionId: string }
  | { tipo: 'presencia' };

export type Subscriber = (ev: ChatEvent) => void;

export interface ChatBus {
  /** Identificador del transport (para logs y debug). */
  readonly transport: 'memory' | 'redis';

  /**
   * Registra al `userId` para recibir eventos. Devuelve la función de
   * unsubscribe (idempotente) que el caller debe llamar al desmontar.
   */
  subscribe(userId: string, cb: Subscriber): () => void;

  /** Publica un evento al user. Fire-and-forget. */
  publish(userId: string, ev: ChatEvent): void;

  /** Publica el mismo evento a múltiples users de una vez. */
  publishMany(userIds: string[], ev: ChatEvent): void;

  /** Estadísticas locales para debug y health checks. */
  debugStats(): { users: number; totalSubs: number };
}
