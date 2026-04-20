'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export type LoginState = { error: string | null };

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/dashboard',
    });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Credenciales inválidas o cuenta inactiva' };
    }
    // NEXT_REDIRECT se relanza para que funcione el redirect
    throw error;
  }
}
