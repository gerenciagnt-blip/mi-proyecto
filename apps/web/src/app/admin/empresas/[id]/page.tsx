import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@pila/db';
import { EditEmpresaForm } from './edit-form';

export const metadata = { title: 'Editar Empresa — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function EditEmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [empresa, arls] = await Promise.all([
    prisma.empresa.findUnique({ where: { id } }),
    prisma.arl.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
  ]);
  if (!empresa) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/admin/empresas" className="text-sm text-slate-500 hover:text-slate-900">
            ← Empresas
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Editar empresa</h1>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {empresa.nit} — {empresa.nombre}
          </p>
        </div>
        <Link
          href={`/admin/empresas/${empresa.id}/config`}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Configuración PILA →
        </Link>
      </header>
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <EditEmpresaForm empresa={empresa} arls={arls} />
      </section>
    </div>
  );
}
