import { redirect } from 'next/navigation';
import type { Role } from '@pila/db';
import { auth } from '@/auth';

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return session;
}

export async function requireRole(...allowed: Role[]) {
  const session = await requireAuth();
  if (!allowed.includes(session.user.role)) redirect('/dashboard');
  return session;
}

export async function requireAdmin() {
  return requireRole('ADMIN');
}
