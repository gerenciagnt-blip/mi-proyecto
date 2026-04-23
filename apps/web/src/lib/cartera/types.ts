/**
 * Tipos canónicos del parser de estados de cuenta SGSS. Cada parser
 * específico de entidad devuelve este shape, y el normalizador común lo
 * convierte a filas `CarteraConsolidado` + `CarteraDetallado[]` en BD.
 */

import type { TipoDocumento } from '@pila/db';

export type ParsedOrigen =
  | 'PROTECCION'
  | 'SALUD_TOTAL'
  | 'EPS_SOS'
  | 'EPS_SURA'
  | 'EPS_SANITAS'
  | 'MANUAL';

export type ParsedTipoEntidad = 'EPS' | 'AFP' | 'ARL' | 'CCF';

/** Cabecera extraída de un estado de cuenta. */
export type ParsedCarteraHeader = {
  origenPdf: ParsedOrigen;
  tipoEntidad: ParsedTipoEntidad;
  entidadNombre: string;
  entidadNit?: string;
  empresaNit: string;
  empresaRazonSocial: string;
  /** "AAAA-MM" — desde que período informa el estado de cuenta. */
  periodoDesde?: string;
  /** "AAAA-MM" — corte del estado de cuenta. */
  periodoHasta?: string;
};

/** Una línea canónica del detallado. */
export type ParsedCarteraLinea = {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombreCompleto: string;
  /** "AAAA-MM" */
  periodoCobro: string;
  valorCobro: number;
  ibc?: number;
  novedad?: string;
};

/** Resultado completo de parsear un estado de cuenta. */
export type ParsedCartera = ParsedCarteraHeader & {
  detallado: ParsedCarteraLinea[];
  /** Suma exacta reportada por el PDF (ej. "LA SUMA DE: $7,390,115"). */
  valorTotalInformado: number;
  /** Warnings no bloqueantes — líneas que el parser no pudo mapear. */
  advertencias: string[];
};

/** Resultado con error (el parser no pudo siquiera detectar la entidad). */
export type ParserError = {
  error: string;
  /** Texto crudo del PDF para debugging (se trunca a 500 chars). */
  preview?: string;
};

export type ParseResult =
  | ({ ok: true } & ParsedCartera)
  | ({ ok: false } & ParserError);
