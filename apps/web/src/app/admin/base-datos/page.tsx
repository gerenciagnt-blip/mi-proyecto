import Link from 'next/link';
import { Plus } from 'lucide-react';
import { prisma } from '@pila/db';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Base de datos — Sistema PILA' };
export const dynamic = 'force-dynamic';

const DOC_LABELS: Record<string, string> = {
  CC: 'CC',
  CE: 'CE',
  NIT: 'NIT',
  PAS: 'PAS',
  TI: 'TI',
  RC: 'RC',
  NIP: 'NIP',
};

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function fullName(c: {
  primerNombre: string;
  segundoNombre: string | null;
  primerApellido: string;
  segundoApellido: string | null;
}) {
  return [c.primerNombre, c.segundoNombre, c.primerApellido, c.segundoApellido]
    .filter(Boolean)
    .join(' ');
}

export default async function BaseDatosPage() {
  const afiliaciones = await prisma.afiliacion.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      cotizante: true,
      empresa: { select: { nit: true, nombre: true } },
      tipoCotizante: { select: { codigo: true, nombre: true } },
    },
  });

  const activasCount = await prisma.afiliacion.count({ where: { estado: 'ACTIVA' } });
  const inactivasCount = await prisma.afiliacion.count({ where: { estado: 'INACTIVA' } });
  const cotizantesCount = await prisma.cotizante.count();

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
            Base de datos
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cotizantes afiliados a las empresas de la plataforma.
          </p>
        </div>
        <Link href="/admin/base-datos/nuevo">
          <Button variant="gradient">
            <Plus className="h-4 w-4" />
            <span>Nueva afiliación</span>
          </Button>
        </Link>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Cotizantes únicos
          </p>
          <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-900">
            {cotizantesCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Afiliaciones activas
          </p>
          <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-emerald-700">
            {activasCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Inactivas</p>
          <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-500">
            {inactivasCount}
          </p>
        </div>
      </div>

      {/* Tabla */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">
            Últimas afiliaciones{' '}
            <span className="text-xs font-normal text-slate-500">({afiliaciones.length})</span>
          </p>
          <p className="text-[11px] text-slate-400">
            Mostrando las 200 más recientes. Filtros y búsqueda en Fase 2.2.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Documento</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Empresa</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Nivel</th>
              <th className="px-4 py-2 text-right">Salario</th>
              <th className="px-4 py-2">Ingreso</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {afiliaciones.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Aún no hay afiliaciones — crea la primera con el botón de arriba.
                </td>
              </tr>
            )}
            {afiliaciones.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-mono text-xs">
                  {DOC_LABELS[a.cotizante.tipoDocumento] ?? a.cotizante.tipoDocumento}{' '}
                  {a.cotizante.numeroDocumento}
                </td>
                <td className="px-4 py-3">{fullName(a.cotizante)}</td>
                <td className="px-4 py-3">
                  <p className="text-xs text-slate-500">{a.empresa.nit}</p>
                  <p>{a.empresa.nombre}</p>
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className="font-mono text-slate-500">{a.tipoCotizante.codigo}</span>
                  <span className="ml-2">{a.tipoCotizante.nombre}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{a.nivelRiesgo}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">
                  {copFmt.format(Number(a.salario))}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {a.fechaIngreso.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.estado === 'ACTIVA'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {a.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
