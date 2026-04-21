import Link from 'next/link';
import { Mail, Shield, Building, ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import { Avatar } from '@/components/ui/avatar';

export const metadata = { title: 'Mi perfil — Sistema PILA' };
export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  ALIADO_OWNER: 'Dueño Aliado',
  ALIADO_USER: 'Usuario Aliado',
};

export default async function AdminPerfilPage() {
  const session = await auth();
  if (!session?.user) return null;

  const { name, email, role, sucursalId } = session.user;

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Panel</span>
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-slate-900">
          Mi perfil
        </h1>
        <p className="mt-1 text-sm text-slate-500">Información de tu sesión actual.</p>
      </header>

      {/* Identidad */}
      <section className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <Avatar name={name} size="lg" />
        <div>
          <p className="font-heading text-xl font-semibold text-slate-900">{name}</p>
          <p className="text-sm text-slate-500">{ROLE_LABELS[role] ?? role}</p>
        </div>
      </section>

      {/* Detalle de sesión */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-slate-500">
          Detalle
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
              <dd className="mt-0.5 font-medium text-slate-900">{ROLE_LABELS[role] ?? role}</dd>
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
    </div>
  );
}
