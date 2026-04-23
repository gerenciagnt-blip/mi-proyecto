/**
 * Parser EPS S.O.S. Formato pdf-parse 1.x (línea por línea, no aplanado):
 *
 *   CC     31,431,096ALZATE RENDON DIANA LORENA
 *            52,000        ← valor mora (en su propia línea)
 *   N                       ← tipoMora
 *      2202409N             ← <benefVig><periodoAAAAMM><moraSalario>
 *            52,000
 *   N
 *      0202410N
 *   ...
 *            260,000        ← subtotal cotizante
 *
 * Trabajamos línea por línea detectando:
 *   1. Cabecera cotizante: `CC <NumId>APELLIDOS NOMBRES` (tipo+numero+nombre pegados)
 *   2. Línea de valor solo (numérico)
 *   3. Línea con periodo: `<benefVig><AAAAMM>[NS]` — 7 o 8 caracteres seguidos
 *      donde los últimos 6 son año+mes y el último char es N/S.
 *
 * Asociamos (valor previo) + (periodo siguiente) para formar una línea
 * del detallado. El subtotal al final del bloque cotizante se ignora.
 */

import type { ParsedCartera, ParsedCarteraLinea } from '../types';
import { parsearMonto, normalizarTipoDoc, normalizarPeriodo } from '../detector';

export function parseSos(texto: string): ParsedCartera {
  const advertencias: string[] = [];

  // ---- Razón social + NIT ----
  // "Tipo Id. :\nNI    901,803,655PROFESIONALES ESPECIALIZADOS NACIONALES SAS"
  const razonRe =
    /Tipo Id\.\s*:\s*NI\s+([\d.,]+)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .&\-,]+?)\s*\n/i;
  const rMatch = texto.match(razonRe);
  const empresaNit = (rMatch?.[1] ?? '').replace(/[^\d]/g, '');
  const empresaRazonSocial = rMatch?.[2]?.trim() ?? '';

  // ---- Período ----
  // "Periodo Desde : Periodo Hasta :1995/012026/03"
  const pMatch = texto.match(
    /Periodo\s+Desde\s*:\s*Periodo\s+Hasta\s*:\s*(\d{4})\/(\d{1,2})\s*(\d{4})\/(\d{1,2})/i,
  );
  const periodoDesde = pMatch
    ? `${pMatch[1]}-${String(pMatch[2]).padStart(2, '0')}`
    : undefined;
  const periodoHasta = pMatch
    ? `${pMatch[3]}-${String(pMatch[4]).padStart(2, '0')}`
    : undefined;

  // ---- Total: en SOS el valor viene ANTES del label "Totales por Empresa :" ----
  let valorTotalInformado = 0;
  const totalRe = /([\d.,]{4,})\s*Totales?\s+por\s+Empresa\s*:/i;
  const tMatch = texto.match(totalRe);
  if (tMatch) valorTotalInformado = parsearMonto(tMatch[1]!) ?? 0;

  // ---- Líneas ----
  const detallado: ParsedCarteraLinea[] = [];
  const lines = texto.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // Cabecera cotizante: "CC     31,431,096ALZATE RENDON DIANA LORENA"
  //   (tipo + número con comas pegado al nombre en mayúsculas)
  const headerRe =
    /^(CC|CE|NIT|TI|RC|PT|PA)\s+([\d,.]+)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]+)\s*$/;

  // Línea con periodo: "   2202409N" o "0202410N" — benefVig(1+ dígitos) +
  //   periodo(6 dígitos AAAAMM) + flag N/S
  const periodoLineRe = /^\d+(\d{6})[NS]\s*$/;

  // Línea con solo un valor numérico (con comas opcionales)
  const valorLineRe = /^([\d,]+(?:\.\d+)?)\s*$/;

  let currentDoc: {
    tipoDocumento: import('@pila/db').TipoDocumento;
    numeroDocumento: string;
    nombreCompleto: string;
  } | null = null;
  let valorPendiente: number | null = null;

  for (const line of lines) {
    const h = line.match(headerRe);
    if (h) {
      const tipoDocRaw = h[1]!;
      const numDoc = h[2]!.replace(/[^\d]/g, '');
      const nombre = h[3]!.trim().replace(/\s+/g, ' ');
      const tipoDocumento = normalizarTipoDoc(tipoDocRaw);
      if (!tipoDocumento) {
        currentDoc = null;
        valorPendiente = null;
        continue;
      }
      currentDoc = { tipoDocumento, numeroDocumento: numDoc, nombreCompleto: nombre };
      valorPendiente = null;
      continue;
    }

    if (!currentDoc) continue;

    const p = line.match(periodoLineRe);
    if (p && valorPendiente !== null) {
      const periodoRaw = p[1]!;
      const periodoCobro = normalizarPeriodo(periodoRaw);
      if (periodoCobro) {
        detallado.push({
          ...currentDoc,
          periodoCobro,
          valorCobro: valorPendiente,
        });
      }
      valorPendiente = null;
      continue;
    }

    // Línea con valor (puede ser un valor periódico o el subtotal al final
    // del cotizante). La diferenciamos porque el subtotal NO va seguido
    // por una línea de periodo — si aparece un siguiente valor sin periodo
    // en medio, descartamos el anterior.
    const v = line.match(valorLineRe);
    if (v) {
      const num = parsearMonto(v[1]!);
      if (num !== null) {
        if (valorPendiente !== null) {
          // El valor anterior no se asoció con un periodo — era el subtotal.
          // No lo agregamos. Tomamos el nuevo como pendiente.
        }
        valorPendiente = num;
      }
      continue;
    }

    // Línea con solo "N" o "S" (tipo mora) — la ignoramos.
    if (/^[NS]$/.test(line)) continue;

    // Cualquier otra cosa → probablemente fin del bloque cotizante.
    if (/^Totales?\s+/i.test(line)) {
      currentDoc = null;
      valorPendiente = null;
    }
  }

  if (detallado.length === 0) {
    advertencias.push(
      'No se detectaron líneas con el patrón EPS SOS (¿formato actualizado?).',
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
