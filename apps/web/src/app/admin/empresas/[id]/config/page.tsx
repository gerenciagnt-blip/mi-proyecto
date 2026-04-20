import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@pila/db';
import { ConfigForm } from './config-form';

export const metadata = { title: 'Configuración PILA — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function EmpresaConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const empresa = await prisma.empresa.findUnique({
    where: { id },
    select: {
      id: true,
      nit: true,
      nombre: true,
      nivelesPermitidos: { select: { nivel: true } },
      actividadesPermitidas: { select: { actividadEconomicaId: true } },
      tiposPermitidos: { select: { tipoCotizanteId: true } },
      subtiposPermitidos: { select: { subtipoId: true } },
    },
  });
  if (!empresa) notFound();

  const [actividades, tipos] = await Promise.all([
    prisma.actividadEconomica.findMany({
      where: { active: true },
      orderBy: { codigoCiiu: 'asc' },
      select: { id: true, codigoCiiu: true, descripcion: true },
    }),
    prisma.tipoCotizante.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        subtipos: {
          where: { active: true },
          orderBy: { codigo: 'asc' },
          select: { id: true, codigo: true, nombre: true },
        },
      },
    }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link
          href={`/admin/empresas/${empresa.id}`}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Editar empresa
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Configuración PILA</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">
          {empresa.nit} — {empresa.nombre}
        </p>
      </header>

      <ConfigForm
        empresaId={empresa.id}
        actividades={actividades}
        tipos={tipos}
        selectedNiveles={empresa.nivelesPermitidos.map((n) => n.nivel)}
        selectedActividades={empresa.actividadesPermitidas.map((a) => a.actividadEconomicaId)}
        selectedTipos={empresa.tiposPermitidos.map((t) => t.tipoCotizanteId)}
        selectedSubtipos={empresa.subtiposPermitidos.map((s) => s.subtipoId)}
      />
    </div>
  );
}
