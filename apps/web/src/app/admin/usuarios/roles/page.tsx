import Link from 'next/link';
import { ArrowLeft, Shield, UserCog, UserCheck } from 'lucide-react';
import { prisma } from '@pila/db';
import type { Role } from '@pila/db';
import { PermisosForm } from './permisos-form';

export const metadata = { title: 'Roles — Sistema PILA' };
export const dynamic = 'force-dynamic';

const ROLES = [
  {
    key: 'ADMIN' as const,
    label: 'Administrador',
    desc: 'Staff de la plataforma. Acceso global a todos los módulos.',
    icon: Shield,
    accent: 'from-brand-blue to-brand-blue-dark',
    editable: false,
  },
  {
    key: 'ALIADO_OWNER' as const,
    label: 'Dueño Aliado',
    desc: 'Dueño de un aliado. Ve todas las empresas de su sucursal.',
    icon: UserCog,
    accent: 'from-brand-green to-brand-green-dark',
    editable: true,
  },
  {
    key: 'ALIADO_USER' as const,
    label: 'Usuario Aliado',
    desc: 'Empleado del aliado. Solo empresas con acceso explícito.',
    icon: UserCheck,
    accent: 'from-brand-turquoise to-brand-blue',
    editable: true,
  },
];

export default async function RolesPage() {
  const [counts, permisos] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: true }),
    prisma.permiso.findMany(),
  ]);
  const countByRole = Object.fromEntries(counts.map((c) => [c.role, c._count])) as Record<
    string,
    number
  >;

  const grantedByRole = new Map<Role, string[]>();
  for (const p of permisos) {
    const arr = grantedByRole.get(p.role) ?? [];
    arr.push(`${p.modulo}::${p.accion}`);
    grantedByRole.set(p.role, arr);
  }

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
          Roles y permisos
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada rol tiene una matriz de permisos por módulo × acción (ver, crear, editar, eliminar).
          Marca lo permitido; lo no marcado queda denegado.
        </p>
      </header>

      {/* Stat cards */}
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

      {/* Permisos matrix por rol editable */}
      {ROLES.filter(
        (r): r is typeof r & { key: Exclude<Role, 'ADMIN'> } =>
          r.editable && r.key !== 'ADMIN',
      ).map((r) => (
        <section key={r.key} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="mb-4">
            <h2 className="font-heading text-lg font-semibold text-slate-900">
              Permisos de {r.label}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{r.desc}</p>
          </header>
          <PermisosForm
            role={r.key}
            roleLabel={r.label}
            granted={grantedByRole.get(r.key) ?? []}
          />
        </section>
      ))}

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs text-amber-800">
          <strong>Nota:</strong> ADMIN tiene todos los permisos implícitamente (no aparece en esta
          tabla). La enforcement real de los permisos — ocultar items del menú según rol y
          proteger cada página — se aplica cuando construyamos las pantallas de los aliados en
          las próximas fases.
        </p>
      </section>
    </div>
  );
}
