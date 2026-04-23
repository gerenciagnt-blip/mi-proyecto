/**
 * Parser para EPS Suramericana y EPS Sanitas. Ambos usan layout tabular,
 * pero el orden de columnas DIFIERE ligeramente en el texto extraído:
 *
 *   SURA:
 *     <mora> <total> <idNum> <NOMBRE> <IBC> <esperada> 0 <tipoDoc>
 *       <MM/AAAA> 1 DEPENDIENTE
 *
 *   Sanitas:
 *     <mora> <total> <idNum> <NOMBRE> <MM/AAAA> <IBC> <esperada> 0 <tipoDoc>
 *
 * Los nombres largos pueden romperse en varias líneas, así que aplanamos
 * espacios y usamos un regex que acepta el NOMBRE como texto en mayúsculas
 * hasta toparse con el siguiente número (IBC o período).
 */

import type { ParsedCartera, ParsedCarteraLinea } from '../types';
import {
  normalizarPeriodo,
  parsearMonto,
  normalizarTipoDoc,
} from '../detector';

export function parseSuraSanitas(
  texto: string,
  origen: 'EPS_SURA' | 'EPS_SANITAS',
): ParsedCartera {
  const advertencias: string[] = [];

  // ---- Header común ----
  // Razón social + NIT aparecen en el cuadro de identificación:
  //   "OUTSOURCING CON CALIDAD SAS 901862915 PEREIRA"
  //   o "ECOAGROPECUARIA SAS 901926124 BOGOTA D.C."
  const empresaRe =
    /\n([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .&\-,]+?(?:SAS|S\.A\.S\.?|LTDA|S\.A\.?))\s+(\d{8,12})\s+[A-ZÁÉÍÓÚÑ]/;
  const eMatch = texto.match(empresaRe);
  const empresaRazonSocial = eMatch?.[1]?.trim() ?? '';
  const empresaNit = (eMatch?.[2] ?? '').trim();

  // ---- Período "Desde 01/2020 Hasta 04/2026" ----
  const pMatch = texto.match(/Desde\s+(\d{1,2}\/\d{4})\s+Hasta\s+(\d{1,2}\/\d{4})/i);
  const periodoDesde = pMatch ? normalizarPeriodo(pMatch[1]!) ?? undefined : undefined;
  const periodoHasta = pMatch ? normalizarPeriodo(pMatch[2]!) ?? undefined : undefined;

  // ---- Total en mora — buscamos el valor que aparece al principio bajo
  // "PAGO MÍNIMO" y se repite en el footer "TOTAL EN MORA". ----
  let valorTotalInformado = 0;
  const totalFooter = texto.match(/(\d[\d.,]+)\s+TOTAL\s+COTIZACIÓN/i);
  if (totalFooter) {
    valorTotalInformado = parsearMonto(totalFooter[1]!) ?? 0;
  } else {
    // Fallback: "PAGO MÍNIMO" seguido del valor.
    const pagoMinimo = texto.match(/PAGO MÍNIMO[\s\S]{0,100}?(\d[\d.,]+)/i);
    if (pagoMinimo) valorTotalInformado = parsearMonto(pagoMinimo[1]!) ?? 0;
  }

  // ---- Detallado ----
  const detallado: ParsedCarteraLinea[] = [];

  // Aplanamos: colapsa tabs, saltos y espacios múltiples en un solo espacio.
  const flat = texto.replace(/\s+/g, ' ');

  if (origen === 'EPS_SURA') {
    // Patrón SURA:
    //   <mora> <total> <idNum> <NOMBRE> <IBC> <esperada> 0 <tipoDoc>
    //     <MM/AAAA> 1 (DEPENDIENTE|INDEPENDIENTE)
    //
    // Nota: relajamos la restricción "mora == total" porque en algunas
    // filas difieren ligeramente (total incluye intereses). Tomamos el
    // primer valor como "mora en mora" reportada.
    const filaRe =
      /\b(\d[\d.,]+)\s+\d[\d.,]+\s+(\d{4,15})\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]+?)\s+(\d[\d.,]+)\s+\d[\d.,]+\s+0\s+(CC|CE|PT|PA|NIT|TI|RC|NIP)\s+(\d{1,2}\/\d{4})\s+1\s+(?:DEPENDIENTE|INDEPENDIENTE)/g;

    let m: RegExpExecArray | null;
    while ((m = filaRe.exec(flat)) !== null) {
      const [, moraRaw, numDoc, nombreRaw, ibcRaw, tipoDocRaw, periodoRaw] = m;
      const tipoDocumento = normalizarTipoDoc(tipoDocRaw!);
      if (!tipoDocumento) {
        advertencias.push(`Tipo documento no reconocido: ${tipoDocRaw}`);
        continue;
      }
      const periodoCobro = normalizarPeriodo(periodoRaw!);
      const valorCobro = parsearMonto(moraRaw!);
      if (!periodoCobro || valorCobro === null) continue;
      detallado.push({
        tipoDocumento,
        numeroDocumento: numDoc!,
        nombreCompleto: nombreRaw!.trim().replace(/\s+/g, ' '),
        periodoCobro,
        valorCobro,
        ibc: parsearMonto(ibcRaw!) ?? undefined,
      });
    }
  } else {
    // Patrón Sanitas:
    //   <mora> <total> <idNum> <NOMBRE> <MM/AAAA> <IBC> <esperada> 0 <tipoDoc>
    //
    // Captura:
    //   1=mora  2=idNum  3=nombre  4=periodo  5=ibc  6=tipoDoc
    const filaRe =
      /(\d[\d.,]+)\s+\1\s+(\d{4,15})\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]+?)\s+(\d{1,2}\/\d{4})\s+(\d[\d.,]+)\s+\d[\d.,]+\s+0\s+(CC|CE|PT|PA|NIT|TI|RC|NIP)\b/g;

    let m: RegExpExecArray | null;
    while ((m = filaRe.exec(flat)) !== null) {
      const [, moraRaw, numDoc, nombreRaw, periodoRaw, ibcRaw, tipoDocRaw] = m;
      const tipoDocumento = normalizarTipoDoc(tipoDocRaw!);
      if (!tipoDocumento) {
        advertencias.push(`Tipo documento no reconocido: ${tipoDocRaw}`);
        continue;
      }
      const periodoCobro = normalizarPeriodo(periodoRaw!);
      const valorCobro = parsearMonto(moraRaw!);
      if (!periodoCobro || valorCobro === null) continue;
      detallado.push({
        tipoDocumento,
        numeroDocumento: numDoc!,
        nombreCompleto: nombreRaw!.trim().replace(/\s+/g, ' '),
        periodoCobro,
        valorCobro,
        ibc: parsearMonto(ibcRaw!) ?? undefined,
      });
    }
  }

  if (detallado.length === 0) {
    advertencias.push(
      `No se detectaron líneas con el patrón ${origen === 'EPS_SURA' ? 'Sura' : 'Sanitas'} (posible formato actualizado).`,
    );
  }

  return {
    origenPdf: origen,
    tipoEntidad: 'EPS',
    entidadNombre: origen === 'EPS_SURA' ? 'EPS Suramericana S.A.' : 'EPS Sanitas',
    entidadNit: origen === 'EPS_SURA' ? '890903407' : undefined,
    empresaNit: empresaNit.replace(/[^\d]/g, ''),
    empresaRazonSocial: empresaRazonSocial || '(sin razón social detectada)',
    periodoDesde,
    periodoHasta,
    valorTotalInformado,
    detallado,
    advertencias,
  };
}
