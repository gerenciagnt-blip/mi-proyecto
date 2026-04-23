'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import {
  getRateLimitStatus,
  formatearMensajeBloqueo,
} from '@/lib/auth-rate-limit';

export type LoginState = { error: string | null };

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  // Pre-check: si ya está bloqueado por rate-limit, mensaje claro con
  // tiempo restante (sin invocar signIn, evita hashing bcrypt y DB hit).
  if (email) {
    const status = await getRateLimitStatus(email);
    if (status.bloqueado && status.desbloqueoEn) {
      return { error: formatearMensajeBloqueo(status.desbloqueoEn) };
    }
  }

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: '/admin',
    });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) {
      // Después del intento, re-consultamos el estado para saber si
      // ESTE intento fue el que disparó el bloqueo.
      if (email) {
        const post = await getRateLimitStatus(email);
        if (post.bloqueado && post.desbloqueoEn) {
          return { error: formatearMensajeBloqueo(post.desbloqueoEn) };
        }
      }
      return { error: 'Credenciales inválidas o cuenta inactiva' };
    }
    // NEXT_REDIRECT se relanza para que funcione el redirect
    throw error;
  }
}
