import Link from 'next/link';
import { ArrowLeft, Percent, TrendingUp } from 'lucide-react';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import {
  CreateTarifaButton,
  EditTarifaButton,
  type TarifaInitial,
} from './tarifa-dialog';
import { CreateFspButton, EditFspButton, type FspInitial } from './fsp-dialog';
import { toggleTarifaAction, toggleFspAction } from './actions';

export const metadata = { title: 'Tarifas SGSS — Sistema PILA' };
export const dynamic = 'force-dynamic';

const CONCEPTO_ORDER = ['EPS', 'AFP', 'ARL', 'CCF', 'SENA', 'ICBF'] as const;

const CONCEPTO_LABELS: Record<string, { label: string; desc: string }> = {
  EPS: { label: 'EPS — Salud', desc: '12.5% general · 4% empresas exoneradas (Ley 1607)' },
  AFP: { label: 'AFP — Pensión', desc: 'Aporte base 16% + FSP por rango de SMLV' },
  ARL: { label: 'ARL — Riesgos Laborales', desc: 'Cinco niveles de riesgo según decreto 2090/2003' },
  CCF: { label: 'CCF — Caja de Compensación', desc: 'Dependiente 4% · Independiente 0.6% o 2%' },
  SENA: { label: 'SENA', desc: 'Parafiscal 2% · Exonerado con Ley 1607' },
  ICBF: { label: 'ICBF', desc: 'Parafiscal 3% · Exonerado con Ley 1607' },
};

function pctFmt(n: number) {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

export default async function TarifasPage() {
  const [tarifas, fspRangos] = await Promise.all([
    prisma.tarifaSgss.findMany({ orderBy: [{ concepto: 'asc' }, { porcentaje: 'asc' }] }),
    prisma.fspRango.findMany({ orderBy: { smlvDesde: 'asc' } }),
  ]);

  const byConcepto = new Map<string, TarifaInitial[]>();
  for (const t of tarifas) {
    const arr = byConcepto.get(t.concepto) ?? [];
    arr.push({
      id: t.id,
      concepto: t.concepto as TarifaInitial['concepto'],
      modalidad: t.modalidad,
      nivelRiesgo: t.nivelRiesgo,
      exonera: t.exonera,
      porcentaje: Number(t.porcentaje),
      etiqueta: t.etiqueta,
      observaciones: t.observaciones,
    });
    byConcepto.set(t.concepto, arr);
  }

  const rows = CONCEPTO_ORDER.map((c) => ({
    concepto: c,
    label: CONCEPTO_LABELS[c]?.label ?? c,
    desc: CONCEPTO_LABELS[c]?.desc ?? '',
    items: byConcepto.get(c) ?? [],
    activeIds: tarifas.filter((t) => t.concepto === c && t.active).map((t) => t.id),
  }));

  const fspItems: FspInitial[] = fspRangos.map((r) => ({
    id: r.id,
    smlvDesde: Number(r.smlvDesde),
    smlvHasta: r.smlvHasta == null ? null : Number(r.smlvHasta),
    porcentaje: Number(r.porcentaje),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/catalogos"
            className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Catálogos</span>
          </Link>
          <h1 className="mt-2 flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <Percent className="h-6 w-6 text-brand-blue" />
            Tarifas SGSS
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Porcentajes vigentes de salud, pensión, ARL, caja de compensación y parafiscales.
            Se consumen por el motor de liquidación para armar la planilla PILA.
          </p>
        </div>
        <CreateTarifaButton />
      </header>

      {/* Tarifas por concepto */}
      <div className="space-y-4">
        {rows.map((r) => (
          <section
            key={r.concepto}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <header className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-heading text-base font-semibold text-slate-900">
                    {r.label}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">{r.desc}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                  {r.items.length} {r.items.length === 1 ? 'tarifa' : 'tarifas'}
                </span>
              </div>
            </header>

            {r.items.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-400">
                Sin tarifas configuradas para este concepto.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2">Etiqueta</th>
                    <th className="px-5 py-2">Modalidad</th>
                    <th className="px-5 py-2">Nivel</th>
                    <th className="px-5 py-2">Exonera</th>
                    <th className="px-5 py-2 text-right">Porcentaje</th>
                    <th className="px-5 py-2">Estado</th>
                    <th className="px-5 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.items.map((t) => (
                    <TarifaRow
                      key={t.id}
                      t={t}
                      active={r.activeIds.includes(t.id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>

      {/* FSP */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
          <div>
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-900">
              <TrendingUp className="h-4 w-4 text-brand-blue" />
              FSP — Fondo de Solidaridad Pensional
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Porcentaje adicional que se suma al 16% de pensión cuando el IBC supera 4 SMLV.
            </p>
          </div>
          <CreateFspButton />
        </header>

        {fspItems.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">
            Sin rangos FSP configurados.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-2">Desde (SMLV)</th>
                <th className="px-5 py-2">Hasta (SMLV)</th>
                <th className="px-5 py-2 text-right">Porcentaje</th>
                <th className="px-5 py-2">Estado</th>
                <th className="px-5 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fspItems.map((rango) => {
                const fullRow = fspRangos.find((f) => f.id === rango.id)!;
                return (
                  <tr key={rango.id}>
                    <td className="px-5 py-2.5 font-mono text-xs">
                      {rango.smlvDesde.toFixed(2)}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-500">
                      {rango.smlvHasta == null ? '∞' : rango.smlvHasta.toFixed(2)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs">
                      {pctFmt(rango.porcentaje)}%
                    </td>
                    <td className="px-5 py-2.5">
                      <EstadoChip active={fullRow.active} />
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex justify-end gap-1">
                        <EditFspButton rango={rango} />
                        <form action={toggleFspAction.bind(null, rango.id)}>
                          <button
                            type="submit"
                            className="text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            {fullRow.active ? 'Desactivar' : 'Activar'}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
        <strong>Nota:</strong> estas tarifas son parámetros editables. El motor de liquidación
        (Fase futura — módulo Transacciones/Planos) las consumirá para armar la planilla PILA.
        Si cambian las regulaciones, actualiza aquí antes de procesar el período siguiente.
      </section>
    </div>
  );
}

function TarifaRow({ t, active }: { t: TarifaInitial; active: boolean }) {
  return (
    <tr>
      <td className="px-5 py-2.5">
        <p className="font-medium text-slate-800">{t.etiqueta ?? t.concepto}</p>
        {t.observaciones && (
          <p className="mt-0.5 text-[11px] text-slate-500">{t.observaciones}</p>
        )}
      </td>
      <td className="px-5 py-2.5 text-xs text-slate-600">
        {t.modalidad ?? <span className="text-slate-400">Ambas</span>}
      </td>
      <td className="px-5 py-2.5 font-mono text-xs text-slate-600">{t.nivelRiesgo ?? '—'}</td>
      <td className="px-5 py-2.5 text-xs">
        {t.exonera === true ? (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            Sí
          </span>
        ) : t.exonera === false ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            No
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-5 py-2.5 text-right font-mono text-sm font-semibold">
        {pctFmt(t.porcentaje)}%
      </td>
      <td className="px-5 py-2.5">
        <EstadoChip active={active} />
      </td>
      <td className="px-5 py-2.5">
        <div className="flex justify-end gap-1">
          <EditTarifaButton tarifa={t} />
          <form action={toggleTarifaAction.bind(null, t.id)}>
            <button
              type="submit"
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              {active ? 'Desactivar' : 'Activar'}
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

function EstadoChip({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        active
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-slate-100 text-slate-600 ring-slate-200',
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-400')}
      />
      {active ? 'Vigente' : 'Inactiva'}
    </span>
  );
}
