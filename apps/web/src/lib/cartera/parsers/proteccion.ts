/**
 * Parser para AFP Protección S.A. Layout con filas delimitadas por pipes:
 *
 *   | CC | 22651548|MIRANDA ALVIS DANNYS YAMILE | ACT |SOLEDAD |202511 |202602 | 1,015,810| | | | | | | | P |
 *
 * Cada fila del detallado tiene 16 celdas separadas por "|":
 *   [0] vacío  [1] TipoDoc  [2] Cédula  [3] Nombre  [4] Estado  [5] Ciudad
 *   [6] PeríodoDesde  [7] PeríodoHasta  [8] ValorCapital  [9] ValorAFP
 *   [10] CódigoFondo  [11] Novedad  [12] Fecha  [13] IBC  [14] Corrección
 *   [15] Observaciones  [16] Origen (P/I/C)
 *
 * Protección reporta un VALOR ÚNICO por RANGO de períodos. Para tener
 * consistencia con el detallado mensual, expandimos el rango a una línea
 * por mes, dividiendo el valor en partes iguales.
 */

import type { ParsedCartera, ParsedCarteraLinea } from '../types';
import { parsearMonto, normalizarTipoDoc, normalizarPeriodo } from '../detector';

function expandirRangoPeriodo(desde: string, hasta: string): string[] {
  const d = normalizarPeriodo(desde);
  const h = normalizarPeriodo(hasta);
  if (!d || !h) return [];
  const [dy, dm] = d.split('-').map(Number);
  const [hy, hm] = h.split('-').map(Number);
  const out: string[] = [];
  let y = dy!;
  let m = dm!;
  for (let guard = 0; guard < 72; guard++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (y === hy && m === hm) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function parseProteccion(texto: string): ParsedCartera {
  const advertencias: string[] = [];

  // ---- Razón social + NIT (en la cabecera del reporte) ----
  // El texto tiene: "Razón Social : ECOAGROPECUARIA SAS\nEMPLEADOR Dirección : ..."
  // así que buscamos entre "Razón Social :" y el próximo tab/salto/palabra clave.
  const razonRe = /Razón Social\s*:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .&\-,]+?)(?:\s*(?:EMPLEADOR|Dirección|\n|\r))/i;
  const nitRe = /EMPLEADOR[\s\S]{0,200}?NIT\s+([\d.,]+)/i;
  const empresaRazonSocial = texto.match(razonRe)?.[1]?.trim() ?? '';
  const empresaNit = (texto.match(nitRe)?.[1] ?? '').replace(/[^\d]/g, '');

  // ---- Período global "DESDE 1994/04 HASTA 2026/04" ----
  const pMatch = texto.match(/DESDE\s+(\d{4})\/(\d{1,2})\s+HASTA\s+(\d{4})\/(\d{1,2})/i);
  const periodoDesde = pMatch
    ? `${pMatch[1]}-${String(pMatch[2]).padStart(2, '0')}`
    : undefined;
  const periodoHasta = pMatch
    ? `${pMatch[3]}-${String(pMatch[4]).padStart(2, '0')}`
    : undefined;

  // ---- Filas (cada una en su propia línea con pipes) ----
  const detallado: ParsedCarteraLinea[] = [];
  let totalSumado = 0;

  // Procesamos LÍNEA POR LÍNEA porque el patrón depende de que cada fila
  // tenga sus 17 celdas delimitadas. Las líneas empiezan con "|" o con un
  // espacio + "| CC |".
  const lines = texto.split(/\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // Fila candidata: empieza con "|" y termina con "|" y tiene muchos pipes.
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    // 17 celdas + 2 vacías en los extremos = 19 separaciones; validamos al menos 17.
    if (cells.length < 17) continue;

    // cells[0] = '' (antes del primer |), cells[1] = TipoDoc, etc.
    const tipoDocRaw = cells[1];
    const cedula = cells[2];
    const nombre = cells[3];
    const estado = cells[4];
    const desde = cells[6];
    const hasta = cells[7];
    const valorRaw = cells[8];

    // Saltamos filas de encabezado: "Tipo", "Datos del Afiliado", etc.
    if (!tipoDocRaw || tipoDocRaw === 'Tipo') continue;
    if (!cedula || !/^\d/.test(cedula)) continue;
    if (estado !== 'ACT' && estado !== 'TRS' && estado !== 'PEN' && estado !== 'RES') continue;

    const tipoDocumento = normalizarTipoDoc(tipoDocRaw);
    if (!tipoDocumento) {
      advertencias.push(`Tipo documento no reconocido: ${tipoDocRaw}`);
      continue;
    }
    const valorTotal = parsearMonto(valorRaw ?? '');
    if (valorTotal === null) {
      advertencias.push(`Valor capital no reconocido: ${valorRaw}`);
      continue;
    }

    const periodos = expandirRangoPeriodo(desde!, hasta!);
    if (periodos.length === 0) {
      advertencias.push(`Rango período inválido: ${desde}..${hasta}`);
      continue;
    }

    const valorPorMes = Math.round(valorTotal / periodos.length);
    for (const periodoCobro of periodos) {
      detallado.push({
        tipoDocumento,
        numeroDocumento: cedula.replace(/[^\d]/g, ''),
        nombreCompleto: (nombre ?? '').trim().replace(/\s+/g, ' '),
        periodoCobro,
        valorCobro: valorPorMes,
      });
    }
    totalSumado += valorTotal;
  }

  if (detallado.length === 0) {
    advertencias.push(
      'No se detectaron líneas con el patrón Protección (posible formato actualizado).',
    );
  }

  return {
    origenPdf: 'PROTECCION',
    tipoEntidad: 'AFP',
    entidadNombre: 'Protección S.A.',
    entidadNit: '800138188',
    empresaNit,
    empresaRazonSocial: empresaRazonSocial || '(sin razón social detectada)',
    periodoDesde,
    periodoHasta,
    valorTotalInformado: totalSumado,
    detallado,
    advertencias,
  };
}
