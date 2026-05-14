'use client';

import { useEffect } from 'react';
import { heartbeatAction } from './presencia-actions';

// Heartbeat cada 30s — el cliente "reaparece online" 2x más rápido
// después de un sleep/cambio de tab. 1 UPDATE por user activo cada 30s
// es despreciable contra el resto del tráfico de la app.
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Componente invisible montado en el `admin-shell` que dispara un
 * heartbeat cada minuto contra el server para mantener viva la
 * presencia online del user.
 *
 * Diseño:
 *   - Primer tick inmediato al montar (para marcar al user como online
 *     apenas entra al panel).
 *   - Pausa los ticks si la tab está en `document.hidden` para no
 *     consumir BD con tabs olvidadas en background.
 *   - Si vuelves a la tab (visibilitychange → visible) dispara un tick
 *     extra para reaparecer rápido en el listado de online.
 */
export function PresenciaHeartbeat() {
  useEffect(() => {
    let cancelado = false;

    async function tick() {
      if (cancelado || document.hidden) return;
      try {
        await heartbeatAction();
      } catch {
        // Silenciar: un heartbeat fallido no debe romper la UI.
      }
    }

    // Tick inmediato al montar
    void tick();
    const interval = setInterval(tick, HEARTBEAT_INTERVAL_MS);

    function onVisible() {
      if (!document.hidden) void tick();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelado = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
