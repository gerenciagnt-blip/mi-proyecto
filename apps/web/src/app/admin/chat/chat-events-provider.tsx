'use client';

import { useEffect } from 'react';
import { useSWRConfig } from 'swr';

/**
 * Sprint Chat · SSE — provider que abre UNA conexión EventSource al
 * endpoint `/api/chat/stream` y, ante cada evento del bus, dispara
 * el `mutate` de SWR apropiado para refrescar el cliente al instante.
 *
 * Diseño:
 *   - Una sola conexión SSE por tab. Montado en `admin-shell.tsx` para
 *     que esté vivo en todas las pantallas del panel (no solo cuando
 *     el chat está abierto).
 *   - El navegador reconecta automáticamente si la conexión se cae
 *     (configurado con `retry: 5000` en el stream).
 *   - El polling SWR (3-8s) se mantiene como **fallback**: si por
 *     algún motivo el SSE no funciona (proxy mal configurado, multi-
 *     instance sin Redis), los datos siguen llegando con latencia
 *     polling. Defense in depth.
 *   - Componente no renderea nada (null). Es solo el side-effect.
 */
export function ChatEventsProvider() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    // Tip: EventSource respeta cookies por default → la sesión del
    // user llega al endpoint sin configuración extra.
    const url = '/api/chat/stream';
    let es: EventSource | null = null;
    let abortado = false;

    function abrir() {
      if (abortado) return;
      es = new EventSource(url);

      es.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data) as
            | { tipo: 'mensaje'; conversacionId: string }
            | { tipo: 'conv-updated'; conversacionId: string }
            | { tipo: 'heartbeat' };

          if (ev.tipo === 'heartbeat') return;

          if (ev.tipo === 'mensaje') {
            // Mensaje nuevo en alguna conv → refrescar lista (badges,
            // último preview) y mensajes de la conv afectada (si está
            // abierta).
            void mutate('chat:conversaciones');
            void mutate(['chat:mensajes', ev.conversacionId]);
            return;
          }

          if (ev.tipo === 'conv-updated') {
            // Cambio de estado de la conv (cerrada/reabierta) → refrescar.
            void mutate('chat:conversaciones');
            void mutate(['chat:mensajes', ev.conversacionId]);
            return;
          }
        } catch {
          // ignorar mensajes mal formados
        }
      };

      es.onerror = () => {
        // El navegador maneja el retry automáticamente. Si el endpoint
        // está muerto persistentemente, EventSource seguirá intentando
        // en silencio — el polling SWR cubre el gap mientras tanto.
        // No necesitamos cerrar manualmente.
      };
    }

    abrir();

    return () => {
      abortado = true;
      es?.close();
    };
  }, [mutate]);

  return null;
}
