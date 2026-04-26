import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { obtenerEstadoColpatria } from './actions';
import { ColpatriaForm } from './colpatria-form';

export const metadata = { title: 'Colpatria ARL — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function ColpatriaConfigPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const [empresa, estado] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id },
      select: { id: true, nit: true, nombre: true },
    }),
    obtenerEstadoColpatria(id),
  ]);
  if (!empresa || !estado) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link
          href={`/admin/empresas/${id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a la empresa
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Bot Colpatria ARL</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">
          {empresa.nit} — {empresa.nombre}
        </p>
      </header>

      <ColpatriaForm empresaId={empresa.id} empresaNombre={empresa.nombre} estadoInicial={estado} />
    </div>
  );
}
