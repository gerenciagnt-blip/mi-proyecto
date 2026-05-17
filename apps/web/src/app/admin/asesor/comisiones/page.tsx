import Link from 'next/link';
import { TrendingUp, CheckCircle2, XCircle, Lock } from 'lucide-react';
import { notFound } from 'next/navigation';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { calcularComisionAction } from '../../administrativo/comisiones/actions';

export const metadata = { title: 'Mis comisiones — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = { periodoId?: string };

function formatoCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

function mesNombre(mes: number): string {
  return (
    ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][mes - 1] ??
    ''
  );
}

export default async function AsesorComisionesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requirePermiso('admin.asesor_comisiones');
  const scope = await getUserScope();
  if (scope?.tipo !== 'ASESOR') notFound();
  const asesorId = scope.asesorComercialId;
  const sp = await searchParams;

  const periodos = await prisma.periodoContable.findMany({
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    take: 12,
    select: { id: true, anio: true, mes: true, estado: true },
  });
  if (periodos.length === 0) {
    return <Alert variant="info">Aún no hay periodos contables abiertos en el sistema.</Alert>;
  }

  const periodoSeleccionadoId =
    sp.periodoId && periodos.find((p) => p.id === sp.periodoId) ? sp.periodoId : periodos[0]!.id;

  const r = await calcularComisionAction(asesorId, periodoSeleccionadoId);
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <TrendingUp className="h-6 w-6 text-brand-blue" />
            Mis comisiones
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cálculo según las 3 reglas (meta, ≥3 independientes, retiros ≤8%) + bono 10% por cumplir
            las 3. ADMIN cierra la comisión al final del periodo contable.
          </p>
        </div>
        {!d.generaComision && (
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
            No generas comisión
          </span>
        )}
      </header>

      {/* Selector periodo */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <label htmlFor="periodoId" className="text-xs font-medium uppercase text-slate-500">
            Periodo
          </label>
          <select
            id="periodoId"
            name="periodoId"
            defaultValue={periodoSeleccionadoId}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
          >
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.anio}-{String(p.mes).padStart(2, '0')} {mesNombre(p.mes)} —{' '}
                {p.estado === 'CERRADO' ? '✅ cerrado' : '⏳ abierto'}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-blue-dark"
          >
            Ver
          </button>
          {d.cerrada && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <Lock className="h-3 w-3" />
              Cerrada {d.cerradaPorNombre ? `por ${d.cerradaPorNombre}` : ''}
            </span>
          )}
        </form>
      </section>

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

      {/* Desglose */}
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

      <p className="text-xs text-slate-500">
        ¿Dudas con el cálculo? Habla con tu ADMIN o usa el chat. Para ver el detalle por afiliación,
        revisa{' '}
        <Link href="/admin/transacciones/cartera" className="text-brand-blue hover:underline">
          cartera de cotizantes
        </Link>
        .
      </p>
    </div>
  );
}
