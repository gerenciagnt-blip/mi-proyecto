/**
 * Parser para Salud Total EPS. Layout matriz con 12 meses.
 *
 * Una fila real del texto extraído (aplanada):
 *   ACOSTA ALISSON SIRLEY 2/28/2026 3/1/2026 C 1023972040 BOGOTA $0.00 $0.00
 *     0.00 0.00 0.00 72,000.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 2,026
 *     3 72,000.00 Deudor Traslado
 *
 * Orden de columnas (aplanado, no el del render visual):
 *   1) NOMBRE COMPLETO (texto libre en mayúsculas)
 *   2) F.Ingreso  (M/D/YYYY)
 *   3) F.UltPago  (M/D/YYYY  o  "0")
 *   4) TipoDoc    ("C" = CC, "E" = CE, "PT", "PA")
 *   5) NúmDoc
 *   6) Sucursal   (ciudad, mayúsculas)
 *   7) A.Anteriores    ($0.00)
 *   8) Año Pasado      ($0.00)
 *   9-20) Ene..Dic     (14 tokens: 12 meses + Año R. + Mes Ret.)
 *       Ojo: "2,026 3" está en medio como Año R. y Mes Ret., mezclado.
 *   21) TOTAL
 *   22) "Deudor"
 *   23) "Nuevo" | "Traslado"
 *
 * Extraemos los 12 valores mensuales buscando la firma:
 *   <C|E|PT|PA> <NúmDoc> <CIUDAD> $X.XX $X.XX <14 tokens> <TOTAL> Deudor
 */

import type { ParsedCartera, ParsedCarteraLinea } from '../types';
import { parsearMonto, normalizarTipoDoc } from '../detector';

export function parseSaludTotal(texto: string): ParsedCartera {
  const advertencias: string[] = [];

  // ---- Empleador ----
  const empresaRe = /Empleador:\s*([^\n]+?)\s+Documento:\s*N\s*(\d{8,12})/i;
  const eMatch = texto.match(empresaRe);
  const empresaRazonSocial = eMatch?.[1]?.trim() ?? '';
  const empresaNit = (eMatch?.[2] ?? '').trim();

  // ---- Año ----
  const aMatch = texto.match(/Año:\s*(\d{4})/i);
  const anio = aMatch ? Number(aMatch[1]) : new Date().getFullYear();

  // ---- Total ----
  const tMatch = texto.match(/LA SUMA DE\s*:?\s*\$?\s*([\d.,]+)\s*PESOS/i);
  const valorTotalInformado = tMatch ? parsearMonto(tMatch[1]!) ?? 0 : 0;

  // ---- Filas ----
  const detallado: ParsedCarteraLinea[] = [];
  const flat = texto.replace(/\s+/g, ' ');

  // Regex clave: anclamos en "<TipoDoc> <NúmDoc> <CIUDAD> $0.00 $0.00 <14 tokens>"
  // El NOMBRE está ANTES del tipoDoc, separado por " <M/D/YYYY> <M/D/YYYY|0>".
  //
  // Capturamos con lookbehind simulado: tomamos un regex amplio y después
  // separamos el nombre.
  //
  // Patrón completo por fila:
  //   <NOMBRE> <F.Ingreso> <F.UltPago> <TipoDoc> <NúmDoc> <CIUDAD>
  //   $<anterior> $<añoPasado>
  //   <ene> <feb> <mar> <abr> <may> <jun> <jul> <ago> <sep> <oct> <nov> <dic>
  //   <añoR> <mesRet>
  //   <TOTAL> Deudor <Nuevo|Traslado>
  //
  // Nota: los tokens "año R." y "Mes Ret." vienen mezclados en el orden
  // "<AñoR> <MesRet>" DESPUÉS de los 12 meses (observación del PDF real).
  const filaRe =
    /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ \-]+?)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4}|0)\s+(C|E|PT|PA)\s+(\d{4,15})\s+([A-ZÁÉÍÓÚÑ]+)\s+\$?([\d.,]+)\s+\$?([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+[\d.,]+\s+\d+\s+[\d.,]+\s+Deudor\s+(Nuevo|Traslado)/g;

  let m: RegExpExecArray | null;
  while ((m = filaRe.exec(flat)) !== null) {
    const nombre = m[1]!.trim().replace(/\s+/g, ' ');
    const tipoDocRaw = m[4]!;
    const numDoc = m[5]!;
    // m[7..8] = $Anteriores, $Año Pasado (los ignoramos, siempre $0 en nuestros ejemplos)
    const valoresMes = [
      m[9], m[10], m[11], m[12], m[13], m[14], m[15], m[16], m[17], m[18], m[19], m[20],
    ].map((v) => parsearMonto(v ?? '0') ?? 0);

    // Mapeo "C" → CC, "E" → CE, "PT|PA" → PAS.
    const tipoDocStr = tipoDocRaw === 'C' ? 'CC' : tipoDocRaw === 'E' ? 'CE' : 'PAS';
    const tipoDocumento = normalizarTipoDoc(tipoDocStr);
    if (!tipoDocumento) {
      advertencias.push(`Tipo documento no reconocido: ${tipoDocRaw}`);
      continue;
    }

    let generoAlguna = false;
    valoresMes.forEach((val, idx) => {
      if (val > 0) {
        generoAlguna = true;
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
    if (!generoAlguna) {
      advertencias.push(`Cotizante ${numDoc} sin valores mensuales > 0`);
    }
  }

  if (detallado.length === 0) {
    advertencias.push(
      'No se detectaron líneas con el patrón Salud Total (posible formato actualizado).',
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
