'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Building2, User, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { inconsistenciasPlanillaPagosimpleAction } from './pagosimple-action';
import type { PayrollValidationDetailItem } from '@/lib/pagosimple/types';

type InconsistenciasData = {
  inconsistencies_number: number;
  detail_errors_contributor: PayrollValidationDetailItem[];
  detail_errors_company: PayrollValidationDetailItem[];
  detail_warnings: PayrollValidationDetailItem[];
};

/**
 * Dialog que muestra las inconsistencias detalladas de PagoSimple para una
 * planilla en estado ERROR/WARNING. Carga lazy: dispara la action al
 * abrirse, no antes — así no consume llamadas a PagoSimple si nadie abre
 * el modal.
 */
export function InconsistenciasDialog({
  planillaId,
  consecutivo,
  open,
  onClose,
}: {
  planillaId: string;
  consecutivo: string;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<InconsistenciasData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setData(null);
    inconsistenciasPlanillaPagosimpleAction(planillaId)
      .then((res) => {
        if (res.ok) {
          setData({
            inconsistencies_number: res.data.inconsistencies_number,
            detail_errors_contributor: res.data.detail_errors_contributor,
            detail_errors_company: res.data.detail_errors_company,
            detail_warnings: res.data.detail_warnings,
          });
        } else {
          setError(res.error);
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Error desconocido');
      })
      .finally(() => setLoading(false));
  }, [open, planillaId]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Inconsistencias · Planilla ${consecutivo}`}
      description="Errores y warnings detectados por PagoSimple al validar el plano"
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Consultando PagoSimple…
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 ring-1 ring-inset ring-red-200">
          <p className="font-semibold">No se pudieron cargar las inconsistencias</p>
          <p className="mt-1 text-xs">{error}</p>
        </div>
      )}

      {data && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-4 py-2.5 text-xs">
            <span className="font-semibold text-slate-700">
              Total: {data.inconsistencies_number}
            </span>
            <CountChip
              label="Errores cotizante"
              count={data.detail_errors_contributor.length}
              tone="red"
              Icon={User}
            />
            <CountChip
              label="Errores empresa"
              count={data.detail_errors_company.length}
              tone="red"
              Icon={Building2}
            />
            <CountChip
              label="Warnings"
              count={data.detail_warnings.length}
              tone="amber"
              Icon={AlertTriangle}
            />
          </div>

          {data.detail_errors_contributor.length > 0 && (
            <Sección
              titulo="Errores en cotizante"
              tone="red"
              items={data.detail_errors_contributor}
            />
          )}
          {data.detail_errors_company.length > 0 && (
            <Sección titulo="Errores en empresa" tone="red" items={data.detail_errors_company} />
          )}
          {data.detail_warnings.length > 0 && (
            <Sección titulo="Warnings" tone="amber" items={data.detail_warnings} />
          )}

          {data.inconsistencies_number === 0 && (
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
              <p className="font-semibold">Sin inconsistencias detalladas</p>
              <p className="mt-1 text-xs">
                PagoSimple no reportó errores ni warnings para esta planilla. Si el estado de
                validación no es OK, intenta revalidar.
              </p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function CountChip({
  label,
  count,
  tone,
  Icon,
}: {
  label: string;
  count: number;
  tone: 'red' | 'amber';
  Icon: React.ComponentType<{ className?: string }>;
}) {
  if (count === 0) return null;
  const cls =
    tone === 'red'
      ? 'bg-red-50 text-red-700 ring-red-200'
      : 'bg-amber-50 text-amber-800 ring-amber-200';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {label}: {count}
    </span>
  );
}

function Sección({
  titulo,
  tone,
  items,
}: {
  titulo: string;
  tone: 'red' | 'amber';
  items: PayrollValidationDetailItem[];
}) {
  const headerCls =
    tone === 'red'
      ? 'bg-red-50 text-red-800 border-red-200'
      : 'bg-amber-50 text-amber-800 border-amber-200';
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200">
      <header
        className={`flex items-center gap-2 border-b px-4 py-2 text-xs font-semibold ${headerCls}`}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        {titulo} ({items.length})
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-1.5">Fila</th>
              <th className="px-3 py-1.5">Identificación</th>
              <th className="px-3 py-1.5">Descripción</th>
              <th className="px-3 py-1.5">Posición</th>
              <th className="px-3 py-1.5">Auto-corrige</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((it, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-1.5 font-mono text-[10px] text-slate-600">{it.row}</td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-slate-700">
                  {it.identification}
                </td>
                <td className="px-3 py-1.5 text-slate-800">{it.description}</td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                  {it.initial_position && it.final_position
                    ? `${it.initial_position}-${it.final_position}`
                    : '—'}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={
                      it.autocorrect === 'Si'
                        ? 'rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200'
                        : 'rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200'
                    }
                  >
                    {it.autocorrect}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
