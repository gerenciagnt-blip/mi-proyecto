/**
 * Parser EPS Suramericana y EPS Sanitas (mismo layout, parser compartido).
 *
 * El texto extraído por pdf-parse 1.x puede venir con columnas pegadas
 * sin espacios (el render PDF depende de posiciones absolutas). Por eso
 * los regex usan límites "estructurales" en vez de `\s+`:
 *   - Los montos con miles llevan comas: `\d{1,3}(?:,\d{3})*`
 *   - Los números de documento son 4+ dígitos SIN coma
 *   - Los tipos de documento son palabras fijas (CC/CE/PT/PA/NIT)
 *   - Los períodos son MM/AAAA
 *
 * SURA (cada fila):
 *   <mora>[ ]<total><idNum><NOMBRE> <IBC> <esperada> 0<tipoDoc><MM/AAAA>1 DEPENDIENTE
 *
 * Sanitas (cada fila):
 *   <mora>[ ]<total><idNum><NOMBRE><MM/AAAA> <IBC> <esperada> 0<tipoDoc>
 */

import type { ParsedCartera, ParsedCarteraLinea } from '../types';
import {
  normalizarPeriodo,
  parsearMonto,
  normalizarTipoDoc,
} from '../detector';

/** `\d{1,3}(?:,\d{3})*` — número entero con miles opcional. */
const MONTO = String.raw`\d{1,3}(?:,\d{3})*`;

export function parseSuraSanitas(
  texto: string,
  origen: 'EPS_SURA' | 'EPS_SANITAS',
): ParsedCartera {
  const advertencias: string[] = [];

  // ---- Empleador (razón social + NIT pegados): "ECOAGROPECUARIA SAS901926124BOGOTA" ----
  const empresaRe =
    /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .&\-,]+?(?:SAS|S\.A\.S\.?|LTDA|S\.A\.?))(\d{8,12})[A-ZÁÉÍÓÚÑ]/;
  const eMatch = texto.match(empresaRe);
  const empresaRazonSocial = eMatch?.[1]?.trim() ?? '';
  const empresaNit = (eMatch?.[2] ?? '').trim();

  // ---- Período ----
  const pMatch = texto.match(/Desde\s+(\d{1,2}\/\d{4})\s+Hasta\s+(\d{1,2}\/\d{4})/i);
  const periodoDesde = pMatch ? normalizarPeriodo(pMatch[1]!) ?? undefined : undefined;
  const periodoHasta = pMatch ? normalizarPeriodo(pMatch[2]!) ?? undefined : undefined;

  // ---- Total en mora (aparece al inicio bajo PAGO MÍNIMO y al final en TOTAL EN MORA) ----
  let valorTotalInformado = 0;
  const pagoMin = texto.match(/PAGO\s+MÍNIMO[\s\S]{0,120}?\s(\d[\d,]+)\s/i);
  if (pagoMin) valorTotalInformado = parsearMonto(pagoMin[1]!) ?? 0;
  if (valorTotalInformado === 0) {
    const tf = texto.match(/TOTAL\s+EN\s+MORA[\s\S]{0,100}?(\d[\d,]+)/i);
    if (tf) valorTotalInformado = parsearMonto(tf[1]!) ?? 0;
  }

  // ---- Detallado ----
  const detallado: ParsedCarteraLinea[] = [];

  // Aplanamos saltos de línea a espacios — mantiene los tokens sin forzar
  // separaciones artificiales.
  const flat = texto.replace(/\s+/g, ' ');

  if (origen === 'EPS_SURA') {
    // Firma SURA:
    //   <mora>[ ]<total> <idNum> <NOMBRE con mayúsculas+espacios> <IBC> <esperada> 0<tipoDoc><MM/AAAA>1 DEPENDIENTE
    // Grupos:
    //   1=mora  2=idNum  3=nombre  4=ibc  5=tipoDoc  6=periodo
    const filaRe = new RegExp(
      String.raw`\s(${MONTO})\s*(${MONTO})\s*(\d{4,15})([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]+?)\s*(${MONTO})\s+(?:${MONTO})\s+0\s*(CC|CE|PT|PA|NIT|TI|RC|NIP)\s*(\d{1,2}\/\d{4})\s*1\s*(?:DEPENDIENTE|INDEPENDIENTE)`,
      'g',
    );
    let m: RegExpExecArray | null;
    while ((m = filaRe.exec(flat)) !== null) {
      const [, moraRaw, , numDoc, nombreRaw, ibcRaw, tipoDocRaw, periodoRaw] = m;
      const tipoDocumento = normalizarTipoDoc(tipoDocRaw!);
      if (!tipoDocumento) continue;
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
    // Firma Sanitas (sin TIPO DE COTIZANTE, IBC después del período):
    //   <mora>[ ]<total><idNum><NOMBRE><MM/AAAA> <IBC> <esperada> 0<tipoDoc>
    const filaRe = new RegExp(
      String.raw`\s(${MONTO})\s*(${MONTO})(\d{4,15})([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]+?)(\d{1,2}\/\d{4})\s*(${MONTO})\s+(?:${MONTO})\s+0\s*(CC|CE|PT|PA|NIT|TI|RC|NIP)\b`,
      'g',
    );
    let m: RegExpExecArray | null;
    while ((m = filaRe.exec(flat)) !== null) {
      const [, moraRaw, , numDoc, nombreRaw, periodoRaw, ibcRaw, tipoDocRaw] = m;
      const tipoDocumento = normalizarTipoDoc(tipoDocRaw!);
      if (!tipoDocumento) continue;
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
      `No se detectaron líneas con el patrón ${origen === 'EPS_SURA' ? 'Sura' : 'Sanitas'} (¿formato actualizado?).`,
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
