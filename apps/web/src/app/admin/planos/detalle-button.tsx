'use client';

/**
 * Botón "Detalle" + modal con la lista de cotizantes de una planilla
 * (o de un grupo en preview de Consolidado). El fetch ocurre lazy: solo
 * cuando el operador abre el modal, así no se cargan ~N planillas × M
 * cotizantes en cada renderizado de la página.
 */

import { useState, useTransition } from 'react';
import { Eye, Loader2, Building2, User, AlertTriangle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { formatCOP } from '@/lib/format';
import {
  getDetallePlanillaAction,
  getDetalleGrupoConsolidadoAction,
  type CotizanteDetalleRow,
} from './detalle-actions';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

type Props =
  | {
      kind: 'planilla';
      planillaId: string;
      tituloAportante: string;
      tituloPeriodoAporte: string;
    }
  | {
      kind: 'grupo';
      periodoId: string;
      tipo: 'E' | 'I';
      aportanteId: string;
      periodoAporteAnio: number;
      periodoAporteMes: number;
      tituloAportante: string;
      tituloPeriodoAporte: string;
    };

export function DetallePlanillaButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CotizanteDetalleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function abrir() {
    setOpen(true);
    if (rows !== null) return; // ya cargado en una apertura previa
    setError(null);
    startTransition(async () => {
      try {
        const data =
          props.kind === 'planilla'
            ? await getDetallePlanillaAction(props.planillaId)
            : await getDetalleGrupoConsolidadoAction({
                periodoId: props.periodoId,
                tipo: props.tipo,
                aportanteId: props.aportanteId,
                periodoAporteAnio: props.periodoAporteAnio,
                periodoAporteMes: props.periodoAporteMes,
              });
        setRows(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        title="Ver detalle de cotizantes"
      >
        <Eye className="h-3.5 w-3.5" />
        Detalle
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="xl"
        title={
          <span className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-brand-blue" />
            Detalle · {props.tituloAportante}
          </span>
        }
        description={`Período aporte: ${props.tituloPeriodoAporte}`}
      >
        {pending && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando cotizantes…
          </div>
        )}
        {error && (
          <Alert variant="danger">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </Alert>
        )}
        {!pending && !error && rows && rows.length === 0 && (
          <Alert variant="info">
            <span>No hay cotizantes asociados a esta planilla.</span>
          </Alert>
        )}
        {!pending && !error && rows && rows.length > 0 && <DetalleTable rows={rows} />}
      </Dialog>
    </>
  );
}

function DetalleTable({ rows }: { rows: CotizanteDetalleRow[] }) {
  const totalGeneral = rows.reduce((s, r) => s + r.totalGeneral, 0);
  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Cotizantes" value={String(rows.length)} />
        <Stat label="Empleador" value={formatCOP(rows.reduce((s, r) => s + r.totalEmpleador, 0))} />
        <Stat
          label="Trabajador"
          value={formatCOP(rows.reduce((s, r) => s + r.totalTrabajador, 0))}
        />
        <Stat label="Total" value={formatCOP(totalGeneral)} highlight />
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">Documento</th>
              <th className="whitespace-nowrap px-3 py-2">Nombre</th>
              <th className="whitespace-nowrap px-3 py-2">Modalidad</th>
              <th className="whitespace-nowrap px-3 py-2">Empresa</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Días</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">IBC</th>
              <th className="whitespace-nowrap px-3 py-2">EPS</th>
              <th className="whitespace-nowrap px-3 py-2">AFP</th>
              <th className="whitespace-nowrap px-3 py-2">ARL</th>
              <th className="whitespace-nowrap px-3 py-2">CCF</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Empleador</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Trabajador</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.liquidacionId} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px]">
                  {r.tipoDocumento} {r.numeroDocumento}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">
                  {r.nombreCompleto}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <ModalidadBadge modalidad={r.modalidad} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                  {r.empresaNombre ?? '—'}
                  {r.empresaNit && (
                    <span className="ml-1 font-mono text-[10px] text-slate-400">
                      {r.empresaNit}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                  {r.diasCotizados}
                  {(r.diaDesde || r.diaHasta) && (
                    <span className="ml-1 text-[9px] text-slate-400">
                      ({r.diaDesde ?? '?'}–{r.diaHasta ?? '?'})
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                  {formatCOP(r.ibc)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.eps ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.afp ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.arl ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.ccf ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                  {formatCOP(r.totalEmpleador)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                  {formatCOP(r.totalTrabajador)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold">
                  {formatCOP(r.totalGeneral)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td
                colSpan={12}
                className="px-3 py-2 text-right text-[10px] uppercase text-slate-500"
              >
                Total general
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm text-brand-blue-dark">
                {formatCOP(totalGeneral)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Detalle por conceptos — colapsable por cotizante */}
      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
          Ver desglose por concepto (EPS, AFP, ARL, CCF, SENA, ICBF, FSP…)
        </summary>
        <div className="space-y-3 border-t border-slate-100 p-3">
          {rows.map((r) => (
            <ConceptosRow key={r.liquidacionId} r={r} />
          ))}
        </div>
      </details>
    </div>
  );
}

function ConceptosRow({ r }: { r: CotizanteDetalleRow }) {
  if (r.conceptos.length === 0) {
    return (
      <div className="text-xs text-slate-400">{r.nombreCompleto} — sin conceptos calculados</div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-700">
        {r.nombreCompleto}{' '}
        <span className="text-[10px] font-mono text-slate-400">
          ({r.tipoDocumento} {r.numeroDocumento})
        </span>
      </p>
      <table className="w-full text-[11px]">
        <thead className="text-[10px] uppercase text-slate-400">
          <tr>
            <th className="text-left">Concepto</th>
            <th className="text-left">Sub</th>
            <th className="text-right">Base</th>
            <th className="text-right">%</th>
            <th className="text-right">Valor</th>
            <th className="text-left">A cargo</th>
          </tr>
        </thead>
        <tbody>
          {r.conceptos.map((c, i) => (
            <tr key={i} className="border-t border-slate-50">
              <td className="font-mono">{c.concepto}</td>
              <td className="text-slate-500">{c.subconcepto ?? '—'}</td>
              <td className="text-right font-mono">{formatCOP(c.base)}</td>
              <td className="text-right font-mono">{c.porcentaje.toFixed(2)}</td>
              <td className="text-right font-mono">{formatCOP(c.valor)}</td>
              <td className="text-[10px] text-slate-500">
                {c.aCargoEmpleador ? 'Empleador' : 'Trabajador'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-mono text-sm',
          highlight ? 'font-bold text-brand-blue-dark' : 'text-slate-900',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ModalidadBadge({ modalidad }: { modalidad: string }) {
  const isDep = modalidad === 'DEPENDIENTE';
  const Icon = isDep ? Building2 : User;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        isDep
          ? 'bg-sky-50 text-sky-700 ring-sky-200'
          : 'bg-violet-50 text-violet-700 ring-violet-200',
      )}
    >
      <Icon className="h-3 w-3" />
      {isDep ? 'Dep.' : 'Indep.'}
    </span>
  );
}
