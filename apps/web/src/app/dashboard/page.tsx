import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export const metadata = { title: 'Dashboard — Sistema PILA' };

/**
 * `/dashboard` existe por compatibilidad histórica con links antiguos
 * (emails, marcadores del navegador). Todos los roles usan el mismo
 * panel `/admin` — el nav se filtra por rol y cada módulo guarda lo
 * suyo. Esta página solo redirige.
 */
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  redirect('/admin');
}
