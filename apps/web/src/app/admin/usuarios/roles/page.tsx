import Link from 'next/link';
import { ArrowLeft, Shield, UserCog, UserCheck } from 'lucide-react';
import { prisma } from '@pila/db';

export const metadata = { title: 'Roles — Sistema PILA' };
export const dynamic = 'force-dynamic';

const ROLES = [
  {
    key: 'ADMIN' as const,
    label: 'Administrador',
    desc: 'Staff de la plataforma. Acceso global a todos los módulos.',
    icon: Shield,
    accent: 'from-brand-blue to-brand-blue-dark',
  },
  {
    key: 'ALIADO_OWNER' as const,
    label: 'Dueño Aliado',
    desc: 'Dueño de un aliado. Ve todas las empresas de su sucursal.',
    icon: UserCog,
    accent: 'from-brand-green to-brand-green-dark',
  },
  {
    key: 'ALIADO_USER' as const,
    label: 'Usuario Aliado',
    desc: 'Empleado del aliado. Solo empresas con acceso explícito.',
    icon: UserCheck,
    accent: 'from-brand-turquoise to-brand-blue',
  },
];

export default async function RolesPage() {
  const counts = await prisma.user.groupBy({
    by: ['role'],
    _count: true,
  });
  const countByRole = Object.fromEntries(counts.map((c) => [c.role, c._count])) as Record<
    string,
    number
  >;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/usuarios"
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Usuarios</span>
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Roles del sistema
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Roles predefinidos con sus capacidades. Próximamente podrás crear roles personalizados
          con permisos granulares por módulo.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((r) => {
          const Icon = r.icon;
          return (
            <div
              key={r.key}
              className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div
                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${r.accent}`}
                aria-hidden
              />
              <Icon className="h-6 w-6 text-slate-400" />
              <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                {r.key}
              </p>
              <p className="mt-1 font-heading text-xl font-semibold text-slate-900">{r.label}</p>
              <p className="mt-2 text-sm text-slate-600">{r.desc}</p>
              <p className="mt-4 text-xs text-slate-500">
                <span className="font-mono text-base font-bold text-slate-900">
                  {countByRole[r.key] ?? 0}
                </span>{' '}
                usuarios
              </p>
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-slate-500">
          Siguiente iteración
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          Agregar roles personalizables con matriz de permisos (módulo × acción) configurable desde
          esta página. Por ahora los 3 roles del sistema son suficientes.
        </p>
      </section>
    </div>
  );
}
