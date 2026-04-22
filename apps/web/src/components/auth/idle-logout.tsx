'use client';

import { useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';

/**
 * Cierra la sesión automáticamente después de `timeoutMs` de inactividad.
 *
 * Acompaña al timeout JWT server-side (auth.config.ts → maxAge 5 min):
 * el token vence igual, pero si el usuario deja una pantalla abierta sin
 * interactuar este componente lo empuja activamente a `/login?reason=idle`
 * en lugar de que se entere al próximo clic.
 *
 * Eventos que reinician el contador:
 *  - mousedown / keydown / touchstart  (interacción real)
 *  - scroll (scroll programático o del usuario)
 *  - visibilitychange → al volver a la pestaña, reinicia
 *
 * No dispara si otra pestaña ya cerró la sesión — el redirect global lo
 * maneja el middleware de auth al siguiente request.
 */
export function IdleLogout({
  timeoutMs = 5 * 60 * 1000, // 5 minutos
}: {
  timeoutMs?: number;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    const reset = () => {
      if (firedRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        void signOut({ callbackUrl: '/login?reason=idle' });
      }, timeoutMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') reset();
    };

    const events: Array<keyof WindowEventMap> = [
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];
    for (const ev of events) window.addEventListener(ev, reset, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    reset();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const ev of events) window.removeEventListener(ev, reset);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [timeoutMs]);

  return null;
}
