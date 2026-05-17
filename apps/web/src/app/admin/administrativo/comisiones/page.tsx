import Link from 'next/link';
import { TrendingUp, Lock, CheckCircle2, XCircle } from 'lucide-react';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { listarComisionesPeriodoAction } from './actions';
import { CerrarComisionButton } from './cerrar-button';

export const metadata = { title: 'Comisiones · Administrativo — Sistema PILA' };
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

export default async function ComisionesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermiso('admin.comisiones');
  const sp = await searchParams;

  // Cargamos los últimos 12 periodos para el selector.
  const periodos = await prisma.periodoContable.findMany({
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    take: 12,
    select: { id: true, anio: true, mes: true, estado: true },
  });
  if (periodos.length === 0) {
    return (
      <Alert variant="info">
        Aún no hay periodos contables. Abre el primero desde Liquidación para poder calcular
        comisiones.
      </Alert>
    );
  }

  const periodoSeleccionadoId =
    sp.periodoId && periodos.find((p) => p.id === sp.periodoId) ? sp.periodoId : periodos[0]!.id;
  const periodoSel = periodos.find((p) => p.id === periodoSeleccionadoId)!;

  const r = await listarComisionesPeriodoAction(periodoSeleccionadoId);
  const items = r.ok ? r.items : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <TrendingUp className="h-6 w-6 text-brand-blue" />
          Comisiones · Administrativo
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cálculo por asesor según las 3 reglas (meta, ≥3 independientes, retiros ≤8%) + bono 10%
          por cumplir las 3. Solo se puede cerrar la comisión cuando el periodo contable esté
          CERRADO.
        </p>
      </header>

      {/* Selector de periodo */}
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
                {p.estado === 'CERRADO' ? '✅' : '⏳ Abierto'}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-blue-dark"
          >
            Ver
          </button>
          <span className="ml-auto text-xs text-slate-500">
            {periodoSel.estado === 'ABIERTO' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                ⏳ Periodo abierto — no se puede cerrar comisión todavía
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <Lock className="h-3 w-3" />
                Periodo cerrado
              </span>
            )}
          </span>
        </form>
      </section>

      {/* Tabla */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {items.length === 0 ? (
          <Alert variant="info" className="m-5">
            No hay asesores activos para mostrar.
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">Asesor</th>
                  <th className="px-4 py-2 text-right">Meta</th>
                  <th className="px-4 py-2 text-right">Afil. nuevas</th>
                  <th className="px-4 py-2 text-right">%</th>
                  <th className="px-4 py-2 text-right">Comisión</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((c) => (
                  <tr key={c.asesorId} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/administrativo/comisiones/${c.asesorId}?periodoId=${periodoSel.id}`}
                        className="text-brand-blue hover:underline"
                      >
                        <span className="font-mono text-xs">{c.asesorCodigo}</span>{' '}
                        <span className="font-medium">{c.asesorNombre}</span>
                      </Link>
                      {!c.generaComision && (
                        <span className="ml-2 inline-flex rounded-full bg-slate-100 px-1.5 py-0 text-[10px] text-slate-500 ring-1 ring-inset ring-slate-200">
                          sin comisión
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {c.metaMensual ? formatoCOP(c.metaMensual) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-slate-600">
                      {formatoCOP(c.valorAfiliaciones)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                          c.porcentajeAplicado === 0 &&
                            'bg-slate-100 text-slate-600 ring-slate-200',
                          c.porcentajeAplicado > 0 &&
                            c.porcentajeAplicado < 40 &&
                            'bg-amber-50 text-amber-700 ring-amber-200',
                          c.porcentajeAplicado === 40 &&
                            'bg-emerald-50 text-emerald-700 ring-emerald-200',
                        )}
                      >
                        {c.porcentajeAplicado}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-sm font-semibold text-slate-900">
                      {formatoCOP(c.valorComision)}
                    </td>
                    <td className="px-4 py-2">
                      {c.cerrada ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          <Lock className="h-3 w-3" />
                          Cerrada
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <CerrarComisionButton
                        asesorId={c.asesorId}
                        periodoId={periodoSel.id}
                        disabled={c.cerrada || periodoSel.estado !== 'CERRADO' || !c.generaComision}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-500">
        Las 3 reglas:
        <span className="ml-2 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> A
        </span>{' '}
        cumplimiento meta &nbsp;·
        <span className="ml-1 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> B
        </span>{' '}
        ≥3 independientes &nbsp;·
        <span className="ml-1 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> C
        </span>{' '}
        retiros ≤8% &nbsp;+
        <span className="ml-1 inline-flex items-center gap-1">
          <XCircle className="h-3 w-3 text-amber-600" />
        </span>{' '}
        bono 10% al cumplir las 3.
      </p>
    </div>
  );
}
