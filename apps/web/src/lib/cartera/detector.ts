/**
 * Detector de entidad emisora del PDF. Busca patrones característicos en
 * el texto extraído para decidir qué parser específico usar. Si ninguno
 * matchea, devuelve `null` y la UI muestra el fallback manual.
 */

import type { ParsedOrigen } from './types';

export type DetectorResult = {
  origen: ParsedOrigen;
  confianza: 'alta' | 'media';
} | null;

export function detectarOrigen(texto: string): DetectorResult {
  const t = texto.toUpperCase();

  // ----- Salud Total (patrón: header con "DEBE A:\nSALUD TOTAL EPS S.A." o
  // footer con "NIT 800.130.907-4"). Se chequea ANTES que SOS/Sura porque
  // "SALUD" también aparece en otras EPS.
  if (
    (t.includes('SALUD TOTAL EPS') && t.includes('ESTADO DE CUENTA')) ||
    t.includes('NIT 800.130.907-4')
  ) {
    return { origen: 'SALUD_TOTAL', confianza: 'alta' };
  }

  // ----- EPS S.O.S (header "EPS S.O.S S.A" + "LISTADO DE CARTERA POS DETALLADO")
  if (
    t.includes('EPS S.O.S') ||
    t.includes('LISTADO DE CARTERA POS DETALLADO POR PERIODO')
  ) {
    return { origen: 'EPS_SOS', confianza: 'alta' };
  }

  // ----- Sanitas (footer "EPS Sanitas")
  if (t.includes('EPS SANITAS') || t.includes('SANITAS INTERNACIONAL')) {
    return { origen: 'EPS_SANITAS', confianza: 'alta' };
  }

  // ----- SURA (footer "EPS SURAMERICANA S.A." o URL www.epssura.com).
  // Se chequea DESPUÉS de Sanitas porque ambos usan el mismo layout tabular
  // y Sanitas no menciona "SURAMERICANA".
  if (
    t.includes('EPS SURAMERICANA') ||
    t.includes('EPSSURA.COM') ||
    (t.includes('ESTADO DE CUENTA EPS') && t.includes('DECRETO 3260'))
  ) {
    return { origen: 'EPS_SURA', confianza: 'alta' };
  }

  // ----- Protección (AFP) (header "PROTECCION S.A." + "PERIODOS NO COTIZADOS")
  if (
    t.includes('PROTECCION S.A.') ||
    t.includes('PERIODOS NO COTIZADOS POR AFILIADO')
  ) {
    return { origen: 'PROTECCION', confianza: 'alta' };
  }

  return null;
}

/** Utilidades compartidas por varios parsers. */

/**
 * Normaliza cualquier representación de período a "AAAA-MM". Acepta:
 *
 *   "202512"         → "2025-12"    (AAAAMM sin separador)
 *   "2026-01"        → "2026-01"    (ya normalizado)
 *   "2026/01"        → "2026-01"    (slash o guión, AAAA primero)
 *   "01/2026"        → "2026-01"    (MM/AAAA o MM-AAAA)
 *   "01-2026"        → "2026-01"
 *   "2026-04-18"     → "2026-04"    (AAAA-MM-DD — ISO date)
 *   "18-04-2026"     → "2026-04"    (DD-MM-AAAA — fecha latina)
 *   "18/04/2026"     → "2026-04"
 *
 * El número del mes se valida entre 1 y 12. Devuelve null si no matchea.
 */
export function normalizarPeriodo(raw: string): string | null {
  const s = raw.trim();

  // "AAAA-MM-DD" o "AAAA/MM/DD" — tomamos los primeros dos grupos
  const m0 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m0) {
    const [, y, mo] = m0;
    const moNum = Number(mo);
    if (moNum >= 1 && moNum <= 12) {
      return `${y}-${String(moNum).padStart(2, '0')}`;
    }
  }

  // "DD-MM-AAAA" o "DD/MM/AAAA" — tomamos grupo 2 y 3
  const m0b = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m0b) {
    const [, , mo, y] = m0b;
    const moNum = Number(mo);
    if (moNum >= 1 && moNum <= 12) {
      return `${y}-${String(moNum).padStart(2, '0')}`;
    }
  }

  // "202512" → "2025-12"
  const m1 = s.match(/^(\d{4})(\d{2})$/);
  if (m1) {
    const [, y, mo] = m1;
    const moNum = Number(mo);
    if (moNum >= 1 && moNum <= 12) return `${y}-${mo}`;
  }

  // "AAAA-MM" o "AAAA/MM" (ya normalizado o variante)
  const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (m2) {
    const [, y, mo] = m2;
    const moNum = Number(mo);
    if (moNum >= 1 && moNum <= 12) {
      return `${y}-${String(moNum).padStart(2, '0')}`;
    }
  }

  // "MM/AAAA" o "MM-AAAA"
  const m3 = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m3) {
    const [, mo, y] = m3;
    const moNum = Number(mo);
    if (moNum >= 1 && moNum <= 12) {
      return `${y}-${String(moNum).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Convierte un valor monetario con formato latino/anglosajón a número.
 * Acepta: "1,015,810", "$7,390,115", "70,100.00", "79.648.596", "$ 177,938".
 */
export function parsearMonto(raw: string): number | null {
  if (!raw) return null;
  let s = raw.replace(/\$/g, '').replace(/\s/g, '').trim();
  if (!s) return null;

  // Caso "79.648.596" (separador de miles con punto, sin decimales)
  // vs "70,100.00" (coma miles + punto decimal) vs "1.234,56" (latino con decimales).
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // Asume US: "1,234.56" → el punto es decimal, la coma es miles.
    s = s.replace(/,/g, '');
  } else if (hasComma && !hasDot) {
    // "1,234" → coma como miles. "1,234,567" también.
    // Excepción: si la coma está seguida de exactamente 2 dígitos y es la
    // única, puede ser decimal latino. No aplica en los PDFs que procesamos.
    s = s.replace(/,/g, '');
  } else if (hasDot && !hasComma) {
    // "79.648.596" → punto como miles. Si hay más de un punto, son miles.
    const dotsCount = (s.match(/\./g) || []).length;
    if (dotsCount > 1) {
      s = s.replace(/\./g, '');
    }
    // Si hay un solo punto, puede ser decimal — lo dejamos.
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Mapea string "CC", "CE", "NIT", "PT", "PA" etc. al enum TipoDocumento. */
export function normalizarTipoDoc(raw: string): import('@pila/db').TipoDocumento | null {
  const s = raw.toUpperCase().trim();
  // PT = Pasaporte Temporal, PA = Pasaporte → ambos a PAS en nuestro enum
  if (s === 'CC') return 'CC';
  if (s === 'CE') return 'CE';
  if (s === 'NIT' || s === 'NI') return 'NIT';
  if (s === 'PAS' || s === 'PA' || s === 'PT' || s === 'P') return 'PAS';
  if (s === 'TI') return 'TI';
  if (s === 'RC') return 'RC';
  if (s === 'NIP' || s === 'NU') return 'NIP';
  return null;
}
