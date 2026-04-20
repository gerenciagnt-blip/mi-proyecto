import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@pila/db';
import { EditUserForm } from './edit-form';
import { PasswordForm } from './password-form';

export const metadata = { title: 'Editar Usuario — Sistema PILA' };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, sucursales] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.sucursal.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
  ]);
  if (!user) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <Link href="/admin/usuarios" className="text-sm text-slate-500 hover:text-slate-900">
          ← Usuarios
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Editar usuario</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">{user.email}</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold">Datos</h2>
        <EditUserForm user={user} sucursales={sucursales} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold">Restablecer contraseña</h2>
        <PasswordForm userId={user.id} />
      </section>
    </div>
  );
}
