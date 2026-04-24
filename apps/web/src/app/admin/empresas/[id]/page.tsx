import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@pila/db';
import { EditEmpresaForm } from './edit-form';
import { SyncPagosimpleButton } from '../sync-pagosimple-button';
import { isPagosimpleEnabled } from '@/lib/pagosimple/config';

export const metadata = { title: 'Editar Empresa — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function EditEmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [empresa, arls, departamentos] = await Promise.all([
    prisma.empresa.findUnique({ where: { id } }),
    prisma.entidadSgss.findMany({
      where: { tipo: 'ARL', active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
    prisma.departamento.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        municipios: {
          orderBy: { nombre: 'asc' },
          select: { id: true, nombre: true },
        },
      },
    }),
  ]);
  if (!empresa) notFound();

  const departamentosOpts = departamentos.map((d) => ({
    id: d.id,
    nombre: d.nombre,
    municipios: d.municipios,
  }));

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
        <EditEmpresaForm empresa={empresa} arls={arls} departamentos={departamentosOpts} />
      </section>

      {isPagosimpleEnabled() && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Integración PagoSimple</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Crea o actualiza este aportante en PagoSimple bajo el usuario master. Los planos de
              esta empresa usarán ese contributor_id.
            </p>
          </header>
          <SyncPagosimpleButton
            kind="empresa"
            id={empresa.id}
            contributorId={empresa.pagosimpleContributorId}
            syncedAt={empresa.pagosimpleSyncedAt}
          />
        </section>
      )}
    </div>
  );
}
