import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, Lock } from 'lucide-react';
import { notFound } from 'next/navigation';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { calcularComisionAction } from '../actions';
import { CerrarComisionButton } from '../cerrar-button';

export const metadata = { title: 'Comisión asesor · Detalle — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = { periodoId?: string };

function formatoCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function ComisionAsesorDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ asesorId: string }>;
  searchParams: Promise<SP>;
}) {
  await requirePermiso('admin.comisiones');
  const { asesorId } = await params;
  const sp = await searchParams;

  // Si no viene periodoId, usamos el último periodo (más reciente).
  let periodoId = sp.periodoId;
  if (!periodoId) {
    const ultimo = await prisma.periodoContable.findFirst({
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      select: { id: true },
    });
    if (!ultimo) notFound();
    periodoId = ultimo.id;
  }

  const r = await calcularComisionAction(asesorId, periodoId);
  if (!r.ok) {
    return <Alert variant="danger">{r.error}</Alert>;
  }
  const d = r.desglose;

  const ReglaRow = ({
    titulo,
    descripcion,
    valor,
    cumple,
  }: {
    titulo: string;
    descripcion: string;
    valor: string;
    cumple: boolean;
  }) => (
    <tr>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-800">{titulo}</p>
        <p className="text-xs text-slate-500">{descripcion}</p>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm text-slate-700">{valor}</td>
      <td className="px-4 py-3 text-center">
        {cumple ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> +10%
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
            <XCircle className="h-3.5 w-3.5" /> 0%
          </span>
        )}
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/administrativo/comisiones?periodoId=${d.periodoId}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Comisiones</span>
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
            <span className="font-mono text-base text-slate-500">{d.asesorCodigo}</span>{' '}
            {d.asesorNombre}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Comisión del periodo {d.anio}-{String(d.mes).padStart(2, '0')}
          </p>
          {!d.generaComision && (
            <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
              Asesor NO genera comisión
            </span>
          )}
          {d.cerrada && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <Lock className="h-3 w-3" />
              Cerrada {d.cerradaPorNombre ? `por ${d.cerradaPorNombre}` : ''}
            </span>
          )}
        </div>
        <CerrarComisionButton
          asesorId={d.asesorId}
          periodoId={d.periodoId}
          disabled={d.cerrada || d.periodoEstado !== 'CERRADO' || !d.generaComision}
        />
      </header>

      {/* Resumen */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Meta</p>
          <p className="mt-1 font-mono text-xl font-bold tracking-tight text-slate-900">
            {d.metaMensual ? formatoCOP(d.metaMensual) : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">% Aplicado</p>
          <p
            className={cn(
              'mt-1 font-mono text-xl font-bold tracking-tight',
              d.porcentajeAplicado === 0 && 'text-slate-500',
              d.porcentajeAplicado > 0 && d.porcentajeAplicado < 40 && 'text-amber-700',
              d.porcentajeAplicado === 40 && 'text-emerald-700',
            )}
          >
            {d.porcentajeAplicado}%
          </p>
        </div>
        <div className="rounded-xl border border-brand-blue/30 bg-brand-blue/5 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-brand-blue">Comisión</p>
          <p className="mt-1 font-mono text-xl font-bold tracking-tight text-brand-blue">
            {formatoCOP(d.valorComision)}
          </p>
        </div>
      </section>

      {/* Desglose de reglas */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-800">Desglose de reglas</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Regla</th>
              <th className="px-4 py-2 text-right">Métrica</th>
              <th className="px-4 py-2 text-center">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <ReglaRow
              titulo="A · Cumplimiento de meta"
              descripcion={`Σ valor de afiliaciones nuevas (tipo VINCULACION) ≥ meta de ${d.metaMensual ? formatoCOP(d.metaMensual) : '—'}`}
              valor={formatoCOP(d.valorAfiliacionesNuevas)}
              cumple={d.cumplimientoMeta}
            />
            <ReglaRow
              titulo="B · ≥ 3 independientes"
              descripcion="Afiliaciones nuevas del periodo con modalidad INDEPENDIENTE"
              valor={`${d.afiliacionesIndependientes} ${d.afiliacionesIndependientes === 1 ? 'afiliación' : 'afiliaciones'}`}
              cumple={d.cumplimientoIndependientes}
            />
            <ReglaRow
              titulo="C · Retiros ≤ 8%"
              descripcion={`${d.retiros} retiros sobre ${d.cotizantesIniciales} cotizantes activos al inicio del mes`}
              valor={`${d.porcentajeRetiros}%`}
              cumple={d.cumplimientoRetiros}
            />
            <tr className="bg-emerald-50/50">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">Bono · Cumple las 3</p>
                <p className="text-xs text-slate-500">+10% extra si A, B y C cumplen</p>
              </td>
              <td className="px-4 py-3 text-right text-xs text-slate-500">
                {d.cumpleLas3 ? 'Aplica' : 'No aplica'}
              </td>
              <td className="px-4 py-3 text-center">
                {d.cumpleLas3 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> +10% bono
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                    <XCircle className="h-3.5 w-3.5" /> 0%
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
