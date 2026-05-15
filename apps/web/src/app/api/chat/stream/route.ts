import { requireAuth } from '@/lib/auth-helpers';
import { subscribe, type ChatEvent } from '@/lib/chat/bus';

// Forzamos Node runtime — el bus es in-memory por instancia, no funciona
// en Edge. Y `force-dynamic` para que Next no intente cachear el stream.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/stream
 *
 * Conexión SSE persistente por cliente autenticado. El servidor publica
 * eventos del chat (mensaje nuevo, conv updated, etc.) y el cliente
 * (EventSource) los recibe en ~200 ms.
 *
 * Eventos emitidos:
 *   - `{ tipo: 'mensaje', conversacionId }` — cuando llega un mensaje
 *     en una conv donde el user participa.
 *   - `{ tipo: 'conv-updated', conversacionId }` — al cerrar/reabrir/
 *     marcar leído.
 *   - `{ tipo: 'heartbeat' }` — cada 30s para mantener viva la conexión
 *     contra proxies que matan idle.
 *
 * Cliente: ver `chat-events-provider.tsx`. Reconnect automático del
 * navegador con `retry: 30000` enviado en el header SSE.
 *
 * Limpieza:
 *   - El stream se cierra cuando el cliente desconecta o cuando el
 *     timer de heartbeat falla. El unsubscribe del bus se ejecuta en
 *     `cancel` del ReadableStream.
 */
export async function GET(req: Request) {
  const session = await requireAuth();
  const userId = session.user.id;

  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let cerrado = false;

  const stream = new ReadableStream({
    start(controller) {
      function send(data: ChatEvent | { tipo: 'heartbeat' }) {
        if (cerrado) return;
        try {
          // Formato SSE: `data: <JSON>\n\n`. Encodemos a UTF-8.
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Si el controller ya está cerrado, lo capturamos y limpiamos.
          cerrado = true;
          unsubscribe?.();
          if (heartbeat) clearInterval(heartbeat);
        }
      }

      // Retry interval (ms) sugerido al navegador para reconectar tras
      // desconexión. 5s — más rápido que el polling fallback.
      controller.enqueue(encoder.encode('retry: 5000\n\n'));

      // Comentario inicial para evitar buffering de algunos proxies.
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Suscribirse al bus para este user
      unsubscribe = subscribe(userId, (ev) => {
        send(ev);
      });

      // Heartbeat cada 30s para evitar timeouts de proxies (Vercel,
      // Caddy, Nginx con default 60s). El cliente lo ignora.
      heartbeat = setInterval(() => {
        send({ tipo: 'heartbeat' });
      }, 30_000);

      // Si el request se aborta (cliente cerró tab), limpia.
      req.signal.addEventListener('abort', () => {
        cerrado = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // ya cerrado
        }
      });
    },
    cancel() {
      cerrado = true;
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Importante para Nginx — evita buffering.
      'X-Accel-Buffering': 'no',
    },
  });
}
