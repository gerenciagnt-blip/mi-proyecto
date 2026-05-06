'use server';

import { headers } from 'next/headers';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import {
  extraerIpDeHeaders,
  formatearMensajeBloqueo,
  getRateLimitStatus,
  getRateLimitStatusByIp,
} from '@/lib/auth-rate-limit';

export type LoginState = { error: string | null };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const ip = extraerIpDeHeaders(await headers());

  // Pre-check 1: bucket por IP (anti credential-stuffing). Se chequea
  // ANTES que el de email para que un atacante con muchos emails no
  // siquiera dispare el flujo. Mensaje genérico — no revelamos IP.
  const ipStatus = await getRateLimitStatusByIp(ip);
  if (ipStatus.bloqueado && ipStatus.desbloqueoEn) {
    return { error: formatearMensajeBloqueo(ipStatus.desbloqueoEn) };
  }

  // Pre-check 2: bucket por email (anti fuerza-bruta dirigida).
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
      // Después del intento, re-consultamos los DOS buckets para saber
      // si ESTE intento fue el que disparó algún bloqueo.
      const postIp = await getRateLimitStatusByIp(ip);
      if (postIp.bloqueado && postIp.desbloqueoEn) {
        return { error: formatearMensajeBloqueo(postIp.desbloqueoEn) };
      }
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
