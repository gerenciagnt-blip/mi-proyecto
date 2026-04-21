import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@pila/db';
import { NuevaAfiliacionForm } from './form';

export const metadata = { title: 'Nueva afiliación — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function NuevaAfiliacionPage() {
  const [empresas, cuentasCobro, asesores, tiposCotizante] = await Promise.all([
    prisma.empresa.findMany({
      where: { active: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nit: true, nombre: true, arlId: true },
    }),
    prisma.cuentaCobro.findMany({
      where: { active: true },
      orderBy: [{ sucursal: { codigo: 'asc' } }, { codigo: 'asc' }],
      select: {
        id: true,
        codigo: true,
        razonSocial: true,
        sucursalId: true,
      },
    }),
    prisma.asesorComercial.findMany({
      where: { active: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
    prisma.tipoCotizante.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <Link
          href="/admin/base-datos"
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Base de datos</span>
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Nueva afiliación
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Crea el cotizante (si no existe se crea nuevo; si ya existe se actualizan sus datos) y su
          afiliación a la empresa seleccionada.
        </p>
      </header>

      <NuevaAfiliacionForm
        empresas={empresas.map((e) => ({
          id: e.id,
          nit: e.nit,
          nombre: e.nombre,
          sucursalId: null,
        }))}
        cuentasCobro={cuentasCobro}
        asesores={asesores.map((a) => ({ id: a.id, label: `${a.codigo} — ${a.nombre}` }))}
        tiposCotizante={tiposCotizante}
      />
    </div>
  );
}
