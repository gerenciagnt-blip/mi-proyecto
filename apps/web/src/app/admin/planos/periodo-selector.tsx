'use client';

/**
 * Selector de período contable para el módulo Planos. Permite ver
 * históricos (período anterior, etc.) sin cambiar el período actual del
 * sistema.
 *
 * Funcionamiento: setea el query param `periodo=YYYY-MM` y deja que el
 * server component re-renderice con los datos del período elegido. Si
 * no hay query param o se selecciona el mes en curso, navega a la URL
 * limpia (sin `periodo`) para que el comportamiento default vuelva.
 */

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

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

export type PeriodoOption = {
  value: string; // YYYY-MM
  anio: number;
  mes: number;
  estado: 'ABIERTO' | 'CERRADO';
};

export function PeriodoSelector({
  periodos,
  actualValue,
  currentMonthValue,
}: {
  /** Lista de períodos disponibles (más reciente primero). */
  periodos: PeriodoOption[];
  /** Período actualmente visualizado (`YYYY-MM`). */
  actualValue: string;
  /** Período del mes en curso (referencia para "volver a actual"). */
  currentMonthValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const idx = periodos.findIndex((p) => p.value === actualValue);
  const anteriorValue = idx >= 0 && idx < periodos.length - 1 ? periodos[idx + 1]?.value : null;
  const siguienteValue = idx > 0 ? periodos[idx - 1]?.value : null;

  function navigateTo(periodoValue: string | null) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (periodoValue && periodoValue !== currentMonthValue) {
      params.set('periodo', periodoValue);
    } else {
      params.delete('periodo');
    }
    const qs = params.toString();
    const base = pathname ?? '/admin/planos';
    router.push(qs ? `${base}?${qs}` : base);
  }

  const actual = periodos.find((p) => p.value === actualValue);
  const labelActual = actual ? `${MESES[actual.mes - 1]} ${actual.anio}` : actualValue;

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => anteriorValue && navigateTo(anteriorValue)}
        disabled={!anteriorValue}
        className="inline-flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        title="Período anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-1.5 border-x border-slate-200 px-2">
        <Calendar className="h-3.5 w-3.5 text-slate-400" />
        <select
          value={actualValue}
          onChange={(e) => navigateTo(e.target.value)}
          className="cursor-pointer border-0 bg-transparent py-1 text-xs font-medium text-slate-700 focus:outline-none"
          aria-label="Seleccionar período"
        >
          {periodos.map((p) => (
            <option key={p.value} value={p.value}>
              {MESES[p.mes - 1]} {p.anio}
              {p.value === currentMonthValue ? ' (actual)' : ''}
              {p.estado === 'CERRADO' ? ' · cerrado' : ''}
            </option>
          ))}
        </select>
        <span className="sr-only">{labelActual}</span>
      </div>

      <button
        type="button"
        onClick={() => siguienteValue && navigateTo(siguienteValue)}
        disabled={!siguienteValue}
        className="inline-flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        title="Período siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {actualValue !== currentMonthValue && (
        <button
          type="button"
          onClick={() => navigateTo(currentMonthValue)}
          className="ml-1 mr-1 inline-flex h-7 items-center rounded-md bg-slate-100 px-2 text-[10px] font-medium text-slate-600 hover:bg-slate-200"
          title="Volver al período en curso"
        >
          Hoy
        </button>
      )}
    </div>
  );
}
