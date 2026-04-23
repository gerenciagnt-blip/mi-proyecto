import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@pila/db';
import { auth } from '@/auth';
import { UsuariosTabs } from '../usuarios-tabs';
import { EditUserForm } from './edit-form';
import { PasswordForm } from './password-form';

export const metadata = { title: 'Editar usuario — Sistema PILA' };

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, sucursales, rolesCustom, session] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.sucursal.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
    prisma.rolCustom.findMany({
      where: { active: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, basedOn: true },
    }),
    auth(),
  ]);
  if (!user) notFound();
  const sessionUserId = session?.user?.id ?? '';

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
          Editar usuario
        </h1>
        <p className="mt-1 font-mono text-xs text-slate-500">{user.email}</p>
      </header>

      <UsuariosTabs />

      <div className="max-w-3xl space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Datos del usuario</h2>
          <EditUserForm
            user={user}
            sucursales={sucursales}
            rolesCustom={rolesCustom}
            sessionUserId={sessionUserId}
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            Restablecer contraseña
          </h2>
          <PasswordForm userId={user.id} />
        </section>
      </div>
    </div>
  );
}
