import Link from 'next/link';
import { Mail, Shield, Building, ArrowRight } from 'lucide-react';
import { auth } from '@/auth';
import { PilaLogo } from '@/components/brand/pila-logo';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { LogoutButton } from './logout-button';

export const metadata = {
  title: 'Dashboard — Sistema PILA',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  ALIADO_OWNER: 'Dueño Aliado',
  ALIADO_USER: 'Usuario Aliado',
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  const { name, email, role, sucursalId } = session.user;
  const isAdmin = role === 'ADMIN';

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 pb-6">
        <PilaLogo size="sm" />
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-slate-900">{name}</p>
            <p className="text-[11px] text-slate-500">{ROLE_LABELS[role] ?? role}</p>
          </div>
          <Avatar name={name} />
          <LogoutButton compact />
        </div>
      </header>

      {/* Bienvenida */}
      <section className="mt-8">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-900">
          Hola, {name.split(' ')[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">Este es tu panel de Sistema PILA.</p>
      </section>

      {/* Info de sesión */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-slate-500">
          Tu sesión
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-5 text-sm sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-xs text-slate-500">Correo</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{email}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-xs text-slate-500">Rol</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {ROLE_LABELS[role] ?? role}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Building className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-xs text-slate-500">Sucursal</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {sucursalId ?? '— (acceso global)'}
              </dd>
            </div>
          </div>
        </dl>
      </section>

      {/* CTA admin */}
      {isAdmin && (
        <section className="mt-6">
          <Link href="/admin">
            <Button size="lg">
              <span>Ir al panel de administración</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </section>
      )}
    </main>
  );
}
