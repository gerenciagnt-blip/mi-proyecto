import * as XLSX from 'xlsx';

export type ImportResult = {
  total: number;
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
};

/**
 * Parsea un archivo Excel/CSV subido vía FormData y devuelve filas como objetos.
 * Usa la primera hoja. La primera fila debe contener los headers.
 */
export async function parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) throw new Error('El archivo no tiene hojas');
  const ws = wb.Sheets[firstSheetName];
  if (!ws) throw new Error('Hoja vacía');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: false, // fuerza todo a string para evitar sorpresas con números
    defval: '',
  });
  return rows;
}

export function newImportResult(): ImportResult {
  return { total: 0, added: 0, updated: 0, skipped: 0, errors: [] };
}
