/**
 * Orchestrator del parser de estados de cuenta. Recibe un `Buffer` con el
 * PDF, extrae texto con pdf-parse, detecta la entidad emisora y delega al
 * parser específico. Si ninguno matchea devuelve `ok: false` y la UI
 * muestra el fallback manual.
 */

import type { ParseResult } from './types';
import { detectarOrigen } from './detector';
import { parseSuraSanitas } from './parsers/sura';
import { parseSaludTotal } from './parsers/salud-total';
import { parseSos } from './parsers/sos';
import { parseProteccion } from './parsers/proteccion';

/**
 * Extrae texto del PDF con pdf-parse. El import es dinámico porque
 * pdf-parse carga pdfjs-dist (~3MB) y no queremos inflar el bundle del
 * server cuando la ruta no se usa.
 */
async function extraerTexto(pdf: Buffer): Promise<string> {
  const mod = await import('pdf-parse');
  const { PDFParse } = mod as unknown as {
    PDFParse: new (opts: { data: Uint8Array }) => {
      getText(): Promise<{ text: string }>;
      destroy(): Promise<void>;
    };
  };
  // pdf-parse 2.x requiere Uint8Array, no Buffer.
  const data = new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

export async function parseCarteraPdf(pdf: Buffer): Promise<ParseResult> {
  let texto: string;
  try {
    texto = await extraerTexto(pdf);
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo leer el PDF: ${err instanceof Error ? err.message : 'desconocido'}`,
    };
  }

  if (!texto || texto.trim().length < 20) {
    return {
      ok: false,
      error: 'El PDF no contiene texto extraíble (¿es una imagen escaneada?). Necesita OCR.',
      preview: texto.slice(0, 500),
    };
  }

  const detect = detectarOrigen(texto);
  if (!detect) {
    return {
      ok: false,
      error:
        'No se reconoció la entidad emisora del estado de cuenta. Usa la opción de carga manual.',
      preview: texto.slice(0, 500),
    };
  }

  try {
    switch (detect.origen) {
      case 'EPS_SURA':
        return { ok: true, ...parseSuraSanitas(texto, 'EPS_SURA') };
      case 'EPS_SANITAS':
        return { ok: true, ...parseSuraSanitas(texto, 'EPS_SANITAS') };
      case 'SALUD_TOTAL':
        return { ok: true, ...parseSaludTotal(texto) };
      case 'EPS_SOS':
        return { ok: true, ...parseSos(texto) };
      case 'PROTECCION':
        return { ok: true, ...parseProteccion(texto) };
      default:
        return {
          ok: false,
          error: `Parser no implementado aún para ${detect.origen}`,
          preview: texto.slice(0, 500),
        };
    }
  } catch (err) {
    return {
      ok: false,
      error: `Error al parsear: ${err instanceof Error ? err.message : 'desconocido'}`,
      preview: texto.slice(0, 500),
    };
  }
}
