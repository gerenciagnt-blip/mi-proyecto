import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@pila/db';
import { EditSucursalForm } from './edit-form';

export const metadata = { title: 'Editar Sucursal — Sistema PILA' };

export default async function EditSucursalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sucursal = await prisma.sucursal.findUnique({ where: { id } });
  if (!sucursal) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <Link href="/admin/sucursales" className="text-sm text-slate-500 hover:text-slate-900">
          ← Sucursales
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Editar sucursal</h1>
      </header>
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <EditSucursalForm sucursal={sucursal} />
      </section>
    </div>
  );
}
