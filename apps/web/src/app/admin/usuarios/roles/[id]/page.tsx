import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@pila/db';
import { EditRolCustomForm } from './edit-form';

export const metadata = { title: 'Editar rol — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function EditRolCustomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rol = await prisma.rolCustom.findUnique({
    where: { id },
    include: { permisos: true },
  });
  if (!rol) notFound();

  const granted = rol.permisos.map((p) => `${p.modulo}::${p.accion}`);

  // El tipo basedOn es Role (ADMIN/ALIADO_OWNER/ALIADO_USER) pero en custom
  // solo usamos los dos últimos. Si llegara uno inválido, default a ALIADO_USER.
  const basedOn: 'ALIADO_OWNER' | 'ALIADO_USER' =
    rol.basedOn === 'ALIADO_OWNER' ? 'ALIADO_OWNER' : 'ALIADO_USER';

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <Link
          href="/admin/usuarios/roles"
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Roles</span>
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          {rol.nombre}
        </h1>
        {rol.descripcion && <p className="mt-1 text-sm text-slate-500">{rol.descripcion}</p>}
      </header>

      <EditRolCustomForm
        rolId={rol.id}
        initial={{
          nombre: rol.nombre,
          descripcion: rol.descripcion ?? '',
          basedOn,
          granted,
        }}
      />
    </div>
  );
}
