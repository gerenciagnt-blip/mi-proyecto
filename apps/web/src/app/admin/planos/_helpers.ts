/**
 * Helpers puros del módulo de Planos.
 *
 * Constantes de label y parsers que se comparten entre `page.tsx` y los
 * sub-componentes en `_components/`. Antes vivían inline en page.tsx
 * (1070 LOC) — extraídos para que los sub-componentes los importen
 * sin acoplarse al archivo grande.
 */

import type { EstadoPlanilla } from '@pila/db';

export type Tab = 'consolidado' | 'guardado' | 'validacion' | 'pagadas';
export type SP = { tab?: string; sucursalId?: string; periodo?: string };

/** `YYYY-MM` → { anio, mes } o null si formato inválido. */
export function parsePeriodoParam(value: string | undefined): { anio: number; mes: number } | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(value.trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { anio, mes };
}

export function formatPeriodoValue(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

export const MESES = [
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

export function mesLabel(anio: number, mes: number) {
  return `${MESES[mes - 1] ?? ''} ${anio}`;
}

export const TIPO_PLANILLA_LABEL: Record<string, string> = {
  E: 'Empleados',
  I: 'Independientes',
  Y: 'Indep. empresa',
  N: 'Correcciones',
  K: 'Estudiantes',
  A: 'Novedad ingreso',
  S: 'Servicio dom.',
};

export const ESTADO_LABEL: Record<EstadoPlanilla, string> = {
  CONSOLIDADO: 'Guardada',
  PAGADA: 'Pagada',
  ANULADA: 'Anulada',
};
