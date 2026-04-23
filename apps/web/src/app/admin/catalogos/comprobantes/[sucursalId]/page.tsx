import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@pila/db';
import { getUserScope } from '@/lib/sucursal-scope';
import { ComprobanteForm } from './form';
import { toggleComprobanteAction } from './actions';

export const metadata = { title: 'Formato comprobante — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function ComprobanteEditPage({
  params,
}: {
  params: Promise<{ sucursalId: string }>;
}) {
  const { sucursalId } = await params;

  // Un aliado solo puede abrir la página de su propia sucursal. Si manipula
  // la URL con otra sucursalId, redirigir a la raíz del módulo.
  const scope = await getUserScope();
  if (scope?.tipo === 'SUCURSAL' && scope.sucursalId !== sucursalId) {
    redirect('/admin/catalogos/comprobantes');
  }

  const [sucursal, formato] = await Promise.all([
    prisma.sucursal.findUnique({ where: { id: sucursalId } }),
    prisma.comprobanteFormato.findUnique({ where: { sucursalId } }),
  ]);

  if (!sucursal) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link
            href="/admin/catalogos/comprobantes"
            className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Formatos</span>
          </Link>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            Formato comprobante
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {sucursal.codigo} — {sucursal.nombre}
          </p>
        </div>
        {formato && (
          <form action={toggleComprobanteAction.bind(null, sucursalId)}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {formato.active ? 'Desactivar' : 'Activar'}
            </button>
          </form>
        )}
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ComprobanteForm
          sucursalId={sucursalId}
          initial={{
            nombre: formato?.nombre ?? 'Predeterminado',
            logoUrl: formato?.logoUrl ?? '',
            encabezado: formato?.encabezado ?? '',
            pieDePagina: formato?.pieDePagina ?? '',
          }}
        />
      </section>
    </div>
  );
}
