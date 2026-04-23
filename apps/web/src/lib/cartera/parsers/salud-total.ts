/**
 * Parser para Salud Total EPS. Matriz 12 meses × cotizante.
 *
 * Formato de una fila en el texto extraído (pdf-parse 1.x — columnas
 * pegadas sin espacios entre ellas):
 *   ACOSTA ALISSON SIRLEY2/28/20263/1/2026C 1023972040BOGOTA$0.00$0.00
 *     0.00 0.00 0.00 72,000.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00
 *     2,026 3 72,000.00DeudorTraslado
 *
 * Orden de tokens:
 *   <NOMBRE><F.Ingreso><F.UltPago><TipoDoc> <NúmDoc><CIUDAD>
 *   $<Anteriores>$<AñoPasado>
 *   <Ene>..<Dic>  ← 12 tokens numéricos
 *   <AñoR> <MesRet> <TOTAL>DeudorNuevo|Traslado
 *
 * Tipo doc: "C" = CC, "E" = CE, "PT"/"PA" = PAS. El espacio entre tipo y
 * número es consistente en el PDF.
 */

import type { ParsedCartera, ParsedCarteraLinea } from '../types';
import { parsearMonto, normalizarTipoDoc } from '../detector';

/** Monto con decimales opcionales: "72,000.00", "0.00", "2,026" */
const MONTO_DEC = String.raw`\d{1,3}(?:,\d{3})*(?:\.\d+)?`;

export function parseSaludTotal(texto: string): ParsedCartera {
  const advertencias: string[] = [];

  // ---- Empleador ----
  // "Empleador: MANUFACTURA Y PROCESOS SASDocumento:N 901913106"
  const empresaRe =
    /Empleador:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .&\-,]+?)\s*Documento:\s*N\s*(\d{8,12})/i;
  const eMatch = texto.match(empresaRe);
  const empresaRazonSocial = eMatch?.[1]?.trim() ?? '';
  const empresaNit = (eMatch?.[2] ?? '').trim();

  // ---- Año ----
  const anio = Number(texto.match(/Año:\s*(\d{4})/i)?.[1] ?? new Date().getFullYear());

  // ---- Total ----
  const tMatch = texto.match(/LA SUMA DE\s*:?\s*\$?\s*([\d.,]+)\s*PESOS/i);
  const valorTotalInformado = tMatch ? parsearMonto(tMatch[1]!) ?? 0 : 0;

  // ---- Filas ----
  const detallado: ParsedCarteraLinea[] = [];
  // Aplanamos saltos de línea a espacios.
  const flat = texto.replace(/\s+/g, ' ');

  // Firma: <NOMBRE><F.Ingreso><F.UltPago><TipoDoc SPACE><NúmDoc><CIUDAD>
  //   $<Ant>$<AñoPasado> <e> <f> <m> <a> <my> <jn> <jl> <ag> <s> <o> <n> <d>
  //   <AñoR> <MesRet> <TOTAL>Deudor<Nue/Tras>
  // Captura 23 grupos; 12 meses son #9..#20.
  const filaRe = new RegExp(
    [
      '([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ \\-]+?)',                          // 1 nombre
      '(\\d{1,2}/\\d{1,2}/\\d{4})',                               // 2 f.ingreso
      '(\\d{1,2}/\\d{1,2}/\\d{4}|0)',                             // 3 f.ultpago
      '(C|E|PT|PA)\\s+',                                          // 4 tipoDoc + SPACE
      '(\\d{4,15})',                                              // 5 numDoc
      '([A-ZÁÉÍÓÚÑ]+)',                                           // 6 sucursal
      '\\$?(' + MONTO_DEC + ')',                                  // 7 anteriores
      '\\$?(' + MONTO_DEC + ')',                                  // 8 añoPasado
      '\\s+(' + MONTO_DEC + ')', // 9 ene
      '\\s+(' + MONTO_DEC + ')', // 10 feb
      '\\s+(' + MONTO_DEC + ')', // 11 mar
      '\\s+(' + MONTO_DEC + ')', // 12 abr
      '\\s+(' + MONTO_DEC + ')', // 13 may
      '\\s+(' + MONTO_DEC + ')', // 14 jun
      '\\s+(' + MONTO_DEC + ')', // 15 jul
      '\\s+(' + MONTO_DEC + ')', // 16 ago
      '\\s+(' + MONTO_DEC + ')', // 17 sep
      '\\s+(' + MONTO_DEC + ')', // 18 oct
      '\\s+(' + MONTO_DEC + ')', // 19 nov
      '\\s+(' + MONTO_DEC + ')', // 20 dic
      '\\s+(' + MONTO_DEC + ')\\s+', // 21 añoR
      '(\\d+)\\s+',                 // 22 mesRet
      '(' + MONTO_DEC + ')',        // 23 total
      'Deudor',
    ].join(''),
    'g',
  );

  let m: RegExpExecArray | null;
  while ((m = filaRe.exec(flat)) !== null) {
    const nombre = m[1]!.trim().replace(/\s+/g, ' ');
    const tipoDocRaw = m[4]!;
    const numDoc = m[5]!;
    const valoresMes = [
      m[9], m[10], m[11], m[12], m[13], m[14], m[15], m[16], m[17], m[18], m[19], m[20],
    ].map((v) => parsearMonto(v ?? '0') ?? 0);

    const tipoDocStr = tipoDocRaw === 'C' ? 'CC' : tipoDocRaw === 'E' ? 'CE' : 'PAS';
    const tipoDocumento = normalizarTipoDoc(tipoDocStr);
    if (!tipoDocumento) continue;

    valoresMes.forEach((val, idx) => {
      if (val > 0) {
        const mesNum = String(idx + 1).padStart(2, '0');
        detallado.push({
          tipoDocumento,
          numeroDocumento: numDoc,
          nombreCompleto: nombre,
          periodoCobro: `${anio}-${mesNum}`,
          valorCobro: val,
        });
      }
    });
  }

  if (detallado.length === 0) {
    advertencias.push(
      'No se detectaron líneas con el patrón Salud Total (¿formato actualizado?).',
    );
  }

  return {
    origenPdf: 'SALUD_TOTAL',
    tipoEntidad: 'EPS',
    entidadNombre: 'Salud Total EPS S.A.',
    entidadNit: '800130907',
    empresaNit: empresaNit.replace(/[^\d]/g, ''),
    empresaRazonSocial: empresaRazonSocial || '(sin razón social detectada)',
    periodoDesde: `${anio}-01`,
    periodoHasta: `${anio}-12`,
    valorTotalInformado,
    detallado,
    advertencias,
  };
}
