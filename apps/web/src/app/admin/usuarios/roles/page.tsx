import Link from 'next/link';
import { ArrowLeft, Shield, UserCog, UserCheck, Layers } from 'lucide-react';
import { prisma } from '@pila/db';
import type { Role } from '@pila/db';
import { PermisosForm } from './permisos-form';
import { CreateRolCustomForm } from './create-rol-form';
import { toggleRolCustomAction } from './actions';

export const metadata = { title: 'Roles y permisos — Sistema PILA' };
export const dynamic = 'force-dynamic';

const ROLES_SISTEMA = [
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

const BASE_LABELS: Record<string, string> = {
  ALIADO_OWNER: 'Dueño Aliado',
  ALIADO_USER: 'Usuario Aliado',
};

export default async function RolesPage() {
  const [counts, permisos, rolesCustom] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: true }),
    prisma.permiso.findMany(),
    prisma.rolCustom.findMany({
      orderBy: [{ active: 'desc' }, { nombre: 'asc' }],
      include: { _count: { select: { permisos: true } } },
    }),
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

      {/* Stat cards — roles de sistema */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES_SISTEMA.map((r) => {
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

      {/* Roles personalizados */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-4">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-slate-900">
            <Layers className="h-5 w-5 text-brand-blue" />
            Roles personalizados
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Crea variaciones con permisos específicos (p. ej. &ldquo;Asesor Sr&rdquo;,
            &ldquo;Supervisor&rdquo;). Se basan en <strong>Dueño Aliado</strong> o{' '}
            <strong>Usuario Aliado</strong>.
          </p>
        </header>

        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-semibold">Nuevo rol</h3>
          <CreateRolCustomForm />
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Basado en</th>
                <th className="px-4 py-2">Permisos</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rolesCustom.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Aún no has creado roles personalizados
                  </td>
                </tr>
              )}
              {rolesCustom.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.nombre}</p>
                    {r.descripcion && (
                      <p className="text-[11px] text-slate-500">{r.descripcion}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {BASE_LABELS[r.basedOn] ?? r.basedOn}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r._count.permisos}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {r.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/admin/usuarios/roles/${r.id}`}
                        className="text-xs font-medium text-brand-blue hover:text-brand-blue-dark"
                      >
                        Configurar
                      </Link>
                      <form action={toggleRolCustomAction.bind(null, r.id)}>
                        <button
                          type="submit"
                          className="text-xs font-medium text-slate-500 hover:text-slate-900"
                        >
                          {r.active ? 'Desactivar' : 'Activar'}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Permisos matrix por rol de sistema editable */}
      {ROLES_SISTEMA.filter(
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
          <strong>Nota:</strong> ADMIN tiene todos los permisos implícitamente. La enforcement
          real (ocultar items del menú y proteger páginas) se aplica cuando construyamos las
          pantallas de los aliados.
        </p>
      </section>
    </div>
  );
}
