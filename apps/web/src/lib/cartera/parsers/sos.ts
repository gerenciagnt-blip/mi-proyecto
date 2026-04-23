/**
 * Parser EPS S.O.S. Layout jerárquico:
 *
 *   ENCABEZADO
 *     "Razón Social:" + "Número Id. : 901,803,655" + "Sede : PEREIRA"
 *     "Periodo Desde : 1995/01 Periodo Hasta : 2026/03"
 *
 *   POR CADA COTIZANTE:
 *     CC  <númeroId>  <APELLIDOS NOMBRES>
 *     <valorMora>  N  <benefVig>  <periodoYYYYMM>  N
 *     ... más filas similares ...
 *     <subtotalCotizante>
 *
 *   AL FINAL:
 *     "Totales por Empresa : X"
 *     "Totales Generales : Y"
 */

import type { ParsedCartera, ParsedCarteraLinea } from '../types';
import { parsearMonto, normalizarTipoDoc, normalizarPeriodo } from '../detector';

export function parseSos(texto: string): ParsedCartera {
  const advertencias: string[] = [];

  // ---- Razón social + NIT ----
  // En el texto extraído los labels vienen DESPUÉS de los valores:
  //   "Tipo Id. : NI \t901,803,655 \tPROFESIONALES ESPECIALIZADOS NACIONALES SAS\tNúmero Id. : \tRazón Social:"
  const razonRe =
    /Tipo Id\.\s*:\s*NI\s+([\d.,]+)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .&\-,]+?)(?:\s+Número Id\.|\n)/i;
  const rMatch = texto.match(razonRe);
  const empresaNit = (rMatch?.[1] ?? '').replace(/[^\d]/g, '');
  const empresaRazonSocial = rMatch?.[2]?.trim() ?? '';

  // ---- Período — los labels también van antes:
  //   "Periodo Desde : \tPeriodo Hasta :\t1995/01 \t2026/03"
  // Primero intentamos el patrón "label primero", luego el normal.
  const pLabelsPrimero =
    /Periodo\s+Desde\s*:?\s+Periodo\s+Hasta\s*:?\s*(\d{4})\/(\d{1,2})\s+(\d{4})\/(\d{1,2})/i;
  const pNormalDesde = /Periodo\s+Desde\s*:?\s*(\d{4})\/(\d{1,2})/i;
  const pNormalHasta = /Periodo\s+Hasta\s*:?\s*(\d{4})\/(\d{1,2})/i;

  let periodoDesde: string | undefined;
  let periodoHasta: string | undefined;
  const plp = texto.match(pLabelsPrimero);
  if (plp) {
    periodoDesde = `${plp[1]}-${String(plp[2]).padStart(2, '0')}`;
    periodoHasta = `${plp[3]}-${String(plp[4]).padStart(2, '0')}`;
  } else {
    const pd = texto.match(pNormalDesde);
    const ph = texto.match(pNormalHasta);
    if (pd) periodoDesde = `${pd[1]}-${String(pd[2]).padStart(2, '0')}`;
    if (ph) periodoHasta = `${ph[1]}-${String(ph[2]).padStart(2, '0')}`;
  }

  // ---- Total: en el PDF aparece como "Totales por Empresa :\n4,935,792"
  // o similar con saltos. Probamos varios patrones y caemos a la suma del
  // detallado si ninguno matchea. ----
  let valorTotalInformado = 0;
  const totalRe1 = /Totales?\s+por\s+Empresa\s*:?[\s\S]{0,80}?([\d.,]{4,})/i;
  const totalRe2 = /Totales?\s+Generales\s*:?[\s\S]{0,80}?([\d.,]{4,})/i;
  const tMatch = texto.match(totalRe1) || texto.match(totalRe2);
  if (tMatch) valorTotalInformado = parsearMonto(tMatch[1]!) ?? 0;

  // ---- Parsing por líneas ----
  const detallado: ParsedCarteraLinea[] = [];
  const lines = texto.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // Cabecera cotizante: "CC  31,431,096  ALZATE RENDON DIANA LORENA"
  // (puede haber tabs en lugar de espacios; normalizamos a \s+)
  const headerCotizanteRe =
    /^(CC|CE|NIT|TI|RC|PT|PA)\s+([\d.,]+)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]+?)\s*$/;

  // Subfila período: "52,000\tN \t2 \t202409\tN" (reemplazamos tabs)
  // Orden: <valorMora> <TipoMora(N/S)> <benefVig(0..)> <periodoAAAAMM> <MoraSalario(N/S)>
  const subfilaRe =
    /^([\d.,]+)\s+[NS]\s+\d+\s+(\d{6})\s+[NS]\s*$/;

  let currentDoc: {
    tipoDocumento: import('@pila/db').TipoDocumento;
    numeroDocumento: string;
    nombreCompleto: string;
  } | null = null;

  for (const line of lines) {
    const hMatch = line.match(headerCotizanteRe);
    if (hMatch) {
      const tipoDocRaw = hMatch[1]!;
      const numDoc = hMatch[2]!.replace(/[^\d]/g, '');
      const nombre = hMatch[3]!.trim().replace(/\s+/g, ' ');
      const tipoDocumento = normalizarTipoDoc(tipoDocRaw);
      if (!tipoDocumento) {
        advertencias.push(`Tipo documento no reconocido: ${tipoDocRaw}`);
        currentDoc = null;
        continue;
      }
      currentDoc = { tipoDocumento, numeroDocumento: numDoc, nombreCompleto: nombre };
      continue;
    }

    const sMatch = line.match(subfilaRe);
    if (sMatch && currentDoc) {
      const valorRaw = sMatch[1]!;
      const periodoRaw = sMatch[2]!;
      const periodoCobro = normalizarPeriodo(periodoRaw);
      const valorCobro = parsearMonto(valorRaw);
      if (!periodoCobro || valorCobro === null) continue;
      detallado.push({ ...currentDoc, periodoCobro, valorCobro });
      continue;
    }

    if (/^Totales?\s+/i.test(line)) currentDoc = null;
  }

  if (detallado.length === 0) {
    advertencias.push(
      'No se detectaron líneas con el patrón EPS SOS (posible formato actualizado).',
    );
  }

  return {
    origenPdf: 'EPS_SOS',
    tipoEntidad: 'EPS',
    entidadNombre: 'EPS S.O.S S.A.',
    empresaNit,
    empresaRazonSocial: empresaRazonSocial || '(sin razón social detectada)',
    periodoDesde,
    periodoHasta,
    valorTotalInformado,
    detallado,
    advertencias,
  };
}
