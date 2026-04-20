import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@pila/db';
import { EmpresasAccessForm } from './empresas-form';

export const metadata = { title: 'Accesos a empresas — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function UserEmpresasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: { sucursal: { select: { codigo: true, nombre: true } } },
  });
  if (!user) notFound();
  if (user.role === 'ADMIN') redirect(`/admin/usuarios/${id}`);

  const [empresas, accesos] = await Promise.all([
    prisma.empresa.findMany({
      where: { active: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nit: true, nombre: true },
    }),
    prisma.usuarioEmpresa.findMany({
      where: { userId: id },
      select: { empresaId: true },
    }),
  ]);

  const granted = accesos.map((a) => a.empresaId);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link href="/admin/usuarios" className="text-sm text-slate-500 hover:text-slate-900">
          ← Usuarios
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Accesos a empresas</h1>
        <p className="mt-1 text-sm text-slate-500">
          <span className="font-medium text-slate-700">{user.name}</span>{' '}
          <span className="font-mono text-xs">({user.email})</span>
          {user.sucursal && (
            <>
              {' · '}
              <span className="font-mono text-xs">{user.sucursal.codigo}</span>
            </>
          )}
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <p className="mb-4 text-sm text-slate-600">
          Marca las empresas a las que este usuario tendrá acceso.
          {user.role === 'ALIADO_OWNER' &&
            ' Como es dueño del aliado, todas las empresas que gestiona su sucursal deberían estar marcadas.'}
        </p>
        <EmpresasAccessForm userId={user.id} empresas={empresas} granted={granted} />
      </section>
    </div>
  );
}
