import * as XLSX from 'xlsx';
import { createHash } from 'node:crypto';

/**
 * Parser genérico de extractos bancarios (Excel/CSV/PDF).
 *
 * Reconoce automáticamente columnas típicas por nombre (es-insensitive):
 *   - fecha | fecha ingreso | fecha valor    → fechaIngreso
 *   - concepto | descripcion | referencia    → concepto
 *   - valor | monto | abono | credito        → valor
 *   - banco (opcional)                         → bancoOrigen
 *
 * Los extractos de cada banco tienen pequeñas diferencias, pero casi todos
 * exportan estas columnas en Excel. Cuando el usuario comparta ejemplos
 * específicos, se pueden agregar parsers dedicados que extiendan este genérico.
 *
 * Para PDF intentamos extraer líneas con patrón
 *   <fecha> ... <concepto> ... <valor>
 * usando regex. Si el extracto tiene formato no estándar, se devuelve
 * `ok=false` con preview del texto para que el usuario use registro manual.
 *
 * Cada fila se normaliza a un registro candidato. El hash identidad evita
 * duplicados al re-importar el mismo archivo.
 */

export type MovimientoCandidato = {
  fechaIngreso: Date;
  concepto: string;
  valor: number;
  bancoOrigen: string | null;
  hashIdentidad: string;
};

export type ParseResult = {
  ok: boolean;
  registros: MovimientoCandidato[];
  errores: string[];
  /** Nombre de columnas detectadas (útil para debug en UI). */
  columnasDetectadas: {
    fecha: string | null;
    concepto: string | null;
    valor: string | null;
    banco: string | null;
  };
};

const FECHA_KEYS = ['fecha ingreso', 'fecha valor', 'fecha', 'date'];
const CONCEPTO_KEYS = ['concepto', 'descripcion', 'descripción', 'referencia', 'detalle'];
const VALOR_KEYS = ['valor', 'monto', 'abono', 'credito', 'crédito', 'importe'];
const BANCO_KEYS = ['banco', 'entidad'];

function findKey(headers: string[], candidates: string[]): string | null {
  const norm = headers.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = norm.indexOf(c);
    if (idx >= 0) return headers[idx] ?? null;
  }
  // Match parcial
  for (const c of candidates) {
    const idx = norm.findIndex((n) => n.includes(c));
    if (idx >= 0) return headers[idx] ?? null;
  }
  return null;
}

function parseDateLoose(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    // Excel serial date: días desde 1899-12-30
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 24 * 60 * 60 * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  // Formatos comunes: dd/mm/yyyy, yyyy-mm-dd, dd-mm-yyyy
  const m1 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(s);
  if (m1) {
    const [, dd, mm, yyRaw] = m1;
    let yy = Number(yyRaw);
    if (yy < 100) yy += 2000;
    const d = new Date(Date.UTC(yy, Number(mm) - 1, Number(dd)));
    return isNaN(d.getTime()) ? null : d;
  }
  const m2 = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(s);
  if (m2) {
    const [, yy, mm, dd] = m2;
    const d = new Date(Date.UTC(Number(yy), Number(mm) - 1, Number(dd)));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseValorLoose(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s) return null;
  // Quita símbolos y espacios: "$1.234.567,89" o "1,234,567.89"
  s = s.replace(/\$|\s|COP/gi, '');
  // Si tiene coma y punto, la última separa decimal
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    // "1.234,56" → decimal es coma
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // "1,234.56" o "1234.56"
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function hashMovimiento(banco: string, fecha: Date, valor: number, concepto: string): string {
  const key = `${banco}|${fecha.toISOString().slice(0, 10)}|${valor}|${concepto.trim().toLowerCase()}`;
  return createHash('sha256').update(key).digest('hex');
}

export function parseExtractoBancario(
  buf: Buffer,
  opts: { bancoDefault?: string } = {},
): ParseResult {
  const errores: string[] = [];
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch (e) {
    return {
      ok: false,
      registros: [],
      errores: [`No se pudo leer el archivo: ${e instanceof Error ? e.message : 'error'}`],
      columnasDetectadas: { fecha: null, concepto: null, valor: null, banco: null },
    };
  }

  const sheetName = wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!sheetName || !sheet) {
    return {
      ok: false,
      registros: [],
      errores: ['El archivo no tiene hojas'],
      columnasDetectadas: { fecha: null, concepto: null, valor: null, banco: null },
    };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });
  if (rows.length === 0) {
    return {
      ok: false,
      registros: [],
      errores: ['El archivo está vacío'],
      columnasDetectadas: { fecha: null, concepto: null, valor: null, banco: null },
    };
  }

  const headers = Object.keys(rows[0]!);
  const fechaKey = findKey(headers, FECHA_KEYS);
  const conceptoKey = findKey(headers, CONCEPTO_KEYS);
  const valorKey = findKey(headers, VALOR_KEYS);
  const bancoKey = findKey(headers, BANCO_KEYS);

  if (!fechaKey || !conceptoKey || !valorKey) {
    return {
      ok: false,
      registros: [],
      errores: [
        `Columnas no reconocidas. Esperadas: fecha, concepto, valor. Detectadas: ${headers.join(' | ')}`,
      ],
      columnasDetectadas: {
        fecha: fechaKey,
        concepto: conceptoKey,
        valor: valorKey,
        banco: bancoKey,
      },
    };
  }

  const registros: MovimientoCandidato[] = [];
  rows.forEach((row, i) => {
    const fecha = parseDateLoose(row[fechaKey]);
    const conceptoRaw = row[conceptoKey];
    const concepto =
      typeof conceptoRaw === 'string' ? conceptoRaw.trim() : String(conceptoRaw ?? '').trim();
    const valor = parseValorLoose(row[valorKey]);
    const banco = (bancoKey ? String(row[bancoKey] ?? '').trim() : '') || opts.bancoDefault || null;

    if (!fecha) {
      errores.push(`Fila ${i + 2}: fecha inválida (${row[fechaKey]})`);
      return;
    }
    if (!concepto) {
      errores.push(`Fila ${i + 2}: concepto vacío`);
      return;
    }
    if (valor === null || valor === 0) {
      errores.push(`Fila ${i + 2}: valor inválido (${row[valorKey]})`);
      return;
    }
    registros.push({
      fechaIngreso: fecha,
      concepto,
      valor,
      bancoOrigen: banco,
      hashIdentidad: hashMovimiento(banco ?? '', fecha, valor, concepto),
    });
  });

  return {
    ok: registros.length > 0,
    registros,
    errores,
    columnasDetectadas: {
      fecha: fechaKey,
      concepto: conceptoKey,
      valor: valorKey,
      banco: bancoKey,
    },
  };
}

// ============================================================
// Parser de PDF
// ============================================================

/**
 * Extrae texto de un PDF usando pdf-parse. Mismo subpath que en cartera
 * para evitar el bug de bootstrap del paquete dentro de Next.
 */
async function extraerTextoPdf(buf: Buffer): Promise<string> {
  // @ts-expect-error — subpath sin tipos declarados
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buf);
  return result.text ?? '';
}

/**
 * Intenta extraer movimientos de un texto plano de extracto bancario.
 *
 * Patrón heurístico por línea:
 *   <fecha dd/mm/aaaa o dd-mm-aaaa> <concepto largo> <valor con $ o ,>
 *
 * Reconoce valores con formato colombiano (`$1.234.567,89` o `1.234.567`)
 * y descarta líneas obviamente de header/footer.
 *
 * Si una línea no cumple el patrón, se ignora silenciosamente — el usuario
 * verá el conteo de líneas leídas para validar que el parser detectó todo.
 */
export function parseExtractoBancarioFromTexto(
  texto: string,
  opts: { bancoDefault?: string } = {},
): ParseResult {
  const errores: string[] = [];
  const registros: MovimientoCandidato[] = [];

  // Línea: fecha + texto + valor al final
  // Ejemplo: "15/04/2026 ABONO INCAPACIDAD EPS SURA 1.234.567,89"
  const lineaRe =
    /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\s+(.+?)\s+\$?\s*([\d.,]+)\s*$/;

  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const linea of lineas) {
    const m = lineaRe.exec(linea);
    if (!m) continue;
    const [, fechaRaw, conceptoRaw, valorRaw] = m;
    const fecha = parseDateLoose(fechaRaw);
    const valor = parseValorLoose(valorRaw);
    const concepto = (conceptoRaw ?? '').trim();
    if (!fecha || valor === null || valor === 0 || !concepto) continue;
    // Filtra valores demasiado chicos que probablemente son sufijos de
    // referencia (ej. comprobante "12345" interpretado como 12345 pesos).
    // Usamos un mínimo de 1000 COP — los movimientos reales son mucho mayores.
    if (Math.abs(valor) < 1000) continue;
    const banco = opts.bancoDefault?.trim() || null;
    registros.push({
      fechaIngreso: fecha,
      concepto,
      valor,
      bancoOrigen: banco,
      hashIdentidad: hashMovimiento(banco ?? '', fecha, valor, concepto),
    });
  }

  if (registros.length === 0) {
    errores.push(
      'No se detectaron líneas con formato "fecha concepto valor". ' +
        'Intenta cargar Excel/CSV o usa Registro manual.',
    );
  }

  return {
    ok: registros.length > 0,
    registros,
    errores,
    columnasDetectadas: {
      fecha: 'auto (PDF)',
      concepto: 'auto (PDF)',
      valor: 'auto (PDF)',
      banco: opts.bancoDefault ? 'manual' : null,
    },
  };
}

/** Parser PDF que envuelve la extracción de texto + el regex parser. */
export async function parseExtractoBancarioPdf(
  buf: Buffer,
  opts: { bancoDefault?: string } = {},
): Promise<ParseResult> {
  let texto: string;
  try {
    texto = await extraerTextoPdf(buf);
  } catch (e) {
    return {
      ok: false,
      registros: [],
      errores: [`No se pudo leer el PDF: ${e instanceof Error ? e.message : 'error'}`],
      columnasDetectadas: { fecha: null, concepto: null, valor: null, banco: null },
    };
  }
  if (!texto.trim()) {
    return {
      ok: false,
      registros: [],
      errores: ['El PDF no contiene texto extraíble (¿es escaneado?)'],
      columnasDetectadas: { fecha: null, concepto: null, valor: null, banco: null },
    };
  }
  return parseExtractoBancarioFromTexto(texto, opts);
}
