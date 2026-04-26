import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { obtenerEstadoColpatria, obtenerCentrosTrabajo } from './actions';
import { ColpatriaForm } from './colpatria-form';
import { ConfigBotForm } from './config-bot-form';
import { CentrosTrabajoForm } from './centros-trabajo-form';

export const metadata = { title: 'Colpatria ARL — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function ColpatriaConfigPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const [empresa, estado, centros] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id },
      select: { id: true, nit: true, nombre: true },
    }),
    obtenerEstadoColpatria(id),
    obtenerCentrosTrabajo(id),
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

      {/* 1. Credenciales del portal */}
      <ColpatriaForm empresaId={empresa.id} empresaNombre={empresa.nombre} estadoInicial={estado} />

      {/* 2. Selectores AXA + defaults form */}
      <ConfigBotForm empresaId={empresa.id} estadoInicial={estado} />

      {/* 3. Mapeo nivel → centro de trabajo */}
      <CentrosTrabajoForm empresaId={empresa.id} niveles={centros} />
    </div>
  );
}
