import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@pila/db';
import { SmlvForm } from './form';

export const metadata = { title: 'SMLV — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function SmlvPage() {
  const config = await prisma.smlvConfig.findUnique({ where: { id: 'singleton' } });
  const valorActual = config ? Number(config.valor) : 0;

  const [afiliacionesTotal, afiliacionesPorDebajo] = await Promise.all([
    prisma.afiliacion.count(),
    valorActual > 0
      ? prisma.afiliacion.count({ where: { salario: { lt: valorActual } } })
      : Promise.resolve(0),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link
          href="/admin/catalogos"
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Catálogos</span>
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          SMLV · Salario Mínimo Legal Vigente
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Valor mensual usado como default y piso al crear afiliaciones. Actualizarlo cascadea a
          toda la base de datos.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <SmlvForm valorActual={valorActual} afiliacionesPorDebajo={afiliacionesPorDebajo} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Estadísticas
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Total de afiliaciones</p>
            <p className="mt-0.5 font-heading text-xl font-bold text-slate-900">
              {afiliacionesTotal}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Con salario ≥ SMLV</p>
            <p className="mt-0.5 font-heading text-xl font-bold text-emerald-700">
              {afiliacionesTotal - afiliacionesPorDebajo}
            </p>
          </div>
        </div>
      </section>

      {config && (
        <p className="text-center text-[11px] text-slate-400">
          Vigente desde {new Date(config.vigenteDesde).toISOString().slice(0, 10)}
        </p>
      )}
    </div>
  );
}
