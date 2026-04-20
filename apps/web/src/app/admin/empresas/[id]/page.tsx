import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@pila/db';
import { EditEmpresaForm } from './edit-form';

export const metadata = { title: 'Editar Empresa — Sistema PILA' };

export default async function EditEmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <Link href="/admin/empresas" className="text-sm text-slate-500 hover:text-slate-900">
          ← Empresas
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Editar empresa</h1>
      </header>
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <EditEmpresaForm empresa={empresa} />
      </section>
    </div>
  );
}
