import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { Genero, TipoDocumento } from '@pila/db';

/**
 * Parser de la plantilla de importación masiva de cotizantes.
 *
 * Acepta CSV o Excel — `xlsx.read` detecta automáticamente.
 *
 * Cada fila se valida con zod. Las filas con error se devuelven en
 * `invalidas` con el detalle de qué falló para que el aliado las
 * corrija antes de re-subir.
 *
 * No persiste — solo parsea y normaliza. La persistencia la hace el
 * server action que llama a este helper.
 */

// ============================================================
// Schema de fila
// ============================================================

const TIPOS_DOC: readonly TipoDocumento[] = ['CC', 'CE', 'TI', 'PAS', 'NIT', 'RC', 'NIP'] as const;

const TIPO_DOC_ENUM = z.enum(['CC', 'CE', 'TI', 'PAS', 'NIT', 'RC', 'NIP']);
const GENERO_ENUM = z.enum(['M', 'F', 'O']);

/**
 * Fecha en formato AAAA-MM-DD. También acepta:
 *   - Valores Date directos (cuando xlsx parsea celdas con `cellDates`).
 *   - Strings ISO con tiempo (que xlsx genera al re-serializar a CSV
 *     fechas que originalmente vinieron como string AAAA-MM-DD).
 */
const fechaSchema = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Formato AAAA-MM-DD'), z.date()])
  .transform((v) => {
    if (v instanceof Date) {
      if (Number.isNaN(v.getTime())) throw new Error('Fecha inválida');
      // Excel a veces da Date local — normalizamos a UTC mediodía.
      return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 12, 0, 0));
    }
    // Tomar solo la parte AAAA-MM-DD (descarta T... Z si vino con tiempo)
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) throw new Error('Fecha inválida');
    const [, y, mo, d] = m;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0));
  });

/** Schema canónico de una fila después de normalizar nombres de columnas. */
export const FilaCotizanteSchema = z.object({
  tipoDocumento: TIPO_DOC_ENUM,
  numeroDocumento: z
    .string()
    .trim()
    .min(4, 'Mínimo 4 caracteres')
    .max(20)
    .regex(/^[A-Z0-9]+$/i, 'Solo letras y números (sin espacios)'),
  primerNombre: z.string().trim().min(1, 'Requerido').max(100),
  segundoNombre: z.string().trim().max(100).optional().nullable(),
  primerApellido: z.string().trim().min(1, 'Requerido').max(100),
  segundoApellido: z.string().trim().max(100).optional().nullable(),
  fechaNacimiento: fechaSchema,
  genero: GENERO_ENUM,
  telefono: z.string().trim().max(30).optional().nullable(),
  celular: z.string().trim().max(30).optional().nullable(),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Correo no válido'),
  direccion: z.string().trim().max(200).optional().nullable(),
});

export type FilaCotizante = z.infer<typeof FilaCotizanteSchema>;

// ============================================================
// Mapeo flexible de nombres de columnas
// ============================================================

/**
 * Mapea posibles nombres de columna del archivo a los keys canónicos del
 * schema. Es case-insensitive y soporta variantes con/sin acentos para
 * que el aliado no tenga que ajustar el header al carácter exacto.
 */
const COLUMNA_ALIASES: Record<keyof FilaCotizante, string[]> = {
  tipoDocumento: ['tipodocumento', 'tipo doc', 'tipo de documento', 'tipo'],
  numeroDocumento: [
    'numerodocumento',
    'numero documento',
    'numero de documento',
    'documento',
    'cedula',
    'cédula',
    'identificacion',
    'identificación',
  ],
  primerNombre: ['primernombre', 'primer nombre', 'nombre1', 'nombre 1'],
  segundoNombre: ['segundonombre', 'segundo nombre', 'nombre2', 'nombre 2'],
  primerApellido: ['primerapellido', 'primer apellido', 'apellido1', 'apellido 1'],
  segundoApellido: ['segundoapellido', 'segundo apellido', 'apellido2', 'apellido 2'],
  fechaNacimiento: ['fechanacimiento', 'fecha nacimiento', 'fecha de nacimiento', 'nacimiento'],
  genero: ['genero', 'género', 'sexo'],
  telefono: ['telefono', 'teléfono', 'tel'],
  celular: ['celular', 'movil', 'móvil'],
  email: ['email', 'correo', 'correo electronico', 'correo electrónico', 'mail'],
  direccion: ['direccion', 'dirección'],
};

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita combining marks (acentos)
    .toLowerCase()
    .trim();
}

function detectarMapeoColumnas(headersOriginales: string[]): {
  mapeo: Partial<Record<keyof FilaCotizante, string>>;
  noMapeadas: string[];
} {
  const headersNorm = headersOriginales.map((h) => ({
    original: h,
    norm: normalizar(h),
  }));
  const mapeo: Partial<Record<keyof FilaCotizante, string>> = {};
  const usadas = new Set<string>();

  for (const [campo, alias] of Object.entries(COLUMNA_ALIASES) as [
    keyof FilaCotizante,
    string[],
  ][]) {
    const aliasNorm = alias.map(normalizar);
    const match = headersNorm.find((h) => !usadas.has(h.original) && aliasNorm.includes(h.norm));
    if (match) {
      mapeo[campo] = match.original;
      usadas.add(match.original);
    }
  }
  const noMapeadas = headersOriginales.filter((h) => !usadas.has(h));
  return { mapeo, noMapeadas };
}

// ============================================================
// Resultado del parser
// ============================================================

export type FilaInvalida = {
  fila: number; // 1-indexed (excluyendo header)
  raw: Record<string, unknown>;
  errores: string[];
};

export type ImportPreview = {
  ok: boolean;
  /** Filas válidas listas para persistir. */
  validas: FilaCotizante[];
  /** Filas con error — el usuario debe corregirlas. */
  invalidas: FilaInvalida[];
  /** Mapeo detectado de nombre de columna → campo del schema. */
  columnasDetectadas: Partial<Record<keyof FilaCotizante, string>>;
  /** Headers del archivo que no se mapearon a ningún campo. */
  columnasIgnoradas: string[];
  /** Errores globales (archivo inválido, sin headers, etc.). */
  errores: string[];
};

// ============================================================
// Parser principal
// ============================================================

const COLUMNAS_REQUERIDAS: (keyof FilaCotizante)[] = [
  'tipoDocumento',
  'numeroDocumento',
  'primerNombre',
  'primerApellido',
  'fechaNacimiento',
  'genero',
];

/**
 * Lee un archivo Excel/CSV con cotizantes a importar y devuelve el preview
 * separando filas válidas de inválidas.
 */
export function parsePlantillaCotizantes(buf: Buffer): ImportPreview {
  const errores: string[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch (e) {
    return {
      ok: false,
      validas: [],
      invalidas: [],
      columnasDetectadas: {},
      columnasIgnoradas: [],
      errores: [`No se pudo leer el archivo: ${e instanceof Error ? e.message : 'error'}`],
    };
  }

  const sheetName = wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!sheetName || !sheet) {
    return {
      ok: false,
      validas: [],
      invalidas: [],
      columnasDetectadas: {},
      columnasIgnoradas: [],
      errores: ['El archivo no tiene hojas'],
    };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });
  if (rows.length === 0) {
    return {
      ok: false,
      validas: [],
      invalidas: [],
      columnasDetectadas: {},
      columnasIgnoradas: [],
      errores: ['El archivo está vacío'],
    };
  }

  const headers = Object.keys(rows[0]!);
  const { mapeo, noMapeadas } = detectarMapeoColumnas(headers);

  // Verificamos que todas las columnas requeridas estén mapeadas.
  const requeridasFaltantes = COLUMNAS_REQUERIDAS.filter((c) => !mapeo[c]);
  if (requeridasFaltantes.length > 0) {
    errores.push(
      `Faltan columnas obligatorias: ${requeridasFaltantes.join(', ')}. Encontradas: ${headers.join(', ')}`,
    );
    return {
      ok: false,
      validas: [],
      invalidas: [],
      columnasDetectadas: mapeo,
      columnasIgnoradas: noMapeadas,
      errores,
    };
  }

  const validas: FilaCotizante[] = [];
  const invalidas: FilaInvalida[] = [];

  rows.forEach((row, idx) => {
    const filaIdx = idx + 2; // +1 por header, +1 por 1-indexing
    // Construir el objeto candidato usando el mapeo.
    const candidato: Record<string, unknown> = {};
    for (const [campo, header] of Object.entries(mapeo)) {
      if (!header) continue;
      let v: unknown = row[header];
      if (typeof v === 'string') v = v.trim();
      if (v === '' || v === null) v = undefined;
      // Normalizaciones comunes
      // 1) Cualquier campo de tipo string que xlsx haya parseado como
      //    número (cédulas largas, teléfonos) lo coercionamos a string.
      if (
        v !== undefined &&
        typeof v === 'number' &&
        (campo === 'numeroDocumento' || campo === 'telefono' || campo === 'celular')
      ) {
        v = String(v);
      }
      if (campo === 'tipoDocumento' && typeof v === 'string') v = v.toUpperCase();
      if (campo === 'numeroDocumento' && typeof v === 'string') v = v.toUpperCase();
      if (campo === 'genero' && typeof v === 'string') v = v.toUpperCase().slice(0, 1);
      candidato[campo] = v;
    }

    const parsed = FilaCotizanteSchema.safeParse(candidato);
    if (parsed.success) {
      validas.push(parsed.data);
    } else {
      invalidas.push({
        fila: filaIdx,
        raw: candidato,
        errores: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
  });

  // Detectar duplicados dentro del MISMO archivo: misma combinación
  // (tipoDoc + numeroDoc) aparece más de una vez. Marcamos las repetidas.
  const vistos = new Map<string, number>(); // key → filaIdx primera aparición
  validas.forEach((v) => {
    const key = `${v.tipoDocumento}|${v.numeroDocumento}`;
    if (vistos.has(key)) {
      // Lo movemos a inválidas con el error claro.
      const filaIdx = validas.indexOf(v) + 2;
      invalidas.push({
        fila: filaIdx,
        raw: v,
        errores: [`Documento duplicado en el archivo (ya aparece en fila ${vistos.get(key)})`],
      });
    } else {
      vistos.set(key, validas.indexOf(v) + 2);
    }
  });
  // Filtramos los duplicados de validas
  const validasUnicas: FilaCotizante[] = [];
  const yaProcesados = new Set<string>();
  for (const v of validas) {
    const key = `${v.tipoDocumento}|${v.numeroDocumento}`;
    if (!yaProcesados.has(key)) {
      validasUnicas.push(v);
      yaProcesados.add(key);
    }
  }

  return {
    ok: true,
    validas: validasUnicas,
    invalidas,
    columnasDetectadas: mapeo,
    columnasIgnoradas: noMapeadas,
    errores,
  };
}

// ============================================================
// Plantilla CSV (descarga)
// ============================================================

/**
 * Genera el contenido de la plantilla CSV con headers + 1 fila de ejemplo
 * para que el aliado sepa qué formato esperamos.
 */
export function generarPlantillaCsv(): string {
  const headers = [
    'tipoDocumento',
    'numeroDocumento',
    'primerNombre',
    'segundoNombre',
    'primerApellido',
    'segundoApellido',
    'fechaNacimiento',
    'genero',
    'telefono',
    'celular',
    'email',
    'direccion',
  ];
  const ejemplo = [
    'CC',
    '1010202020',
    'Juan',
    'Carlos',
    'Pérez',
    'Gómez',
    '1990-04-15',
    'M',
    '6017771122',
    '3001234567',
    'juan.perez@example.com',
    'Calle 123 # 45-67',
  ];
  // Usar punto y coma como delimitador es más amigable para Excel en
  // configuración LatAm. Pero CSV estándar es coma. Vamos con coma para
  // máxima compatibilidad — Excel detecta automáticamente.
  return [headers.join(','), ejemplo.join(',')].join('\r\n');
}

// ============================================================
// Reverse: mapeo del schema al payload de Prisma
// ============================================================

/**
 * Convierte una fila ya validada al payload exacto que espera
 * `prisma.cotizante.create`. Aplica los `null` para opcionales no
 * presentes y respeta el `sucursalId` si se pasa.
 */
export function filaToPrismaPayload(
  fila: FilaCotizante,
  sucursalId: string | null,
): {
  sucursalId: string | null;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  primerNombre: string;
  segundoNombre: string | null;
  primerApellido: string;
  segundoApellido: string | null;
  fechaNacimiento: Date;
  genero: Genero;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  direccion: string | null;
} {
  return {
    sucursalId,
    tipoDocumento: fila.tipoDocumento,
    numeroDocumento: fila.numeroDocumento.toUpperCase(),
    primerNombre: fila.primerNombre,
    segundoNombre: fila.segundoNombre ?? null,
    primerApellido: fila.primerApellido,
    segundoApellido: fila.segundoApellido ?? null,
    fechaNacimiento: fila.fechaNacimiento,
    genero: fila.genero,
    telefono: fila.telefono ?? null,
    celular: fila.celular ?? null,
    email: fila.email ?? null,
    direccion: fila.direccion ?? null,
  };
}

// Para que TS no se queje del unused TIPOS_DOC (lo dejamos exportado por
// si alguna vez se quiere usar en otro lugar como fuente única de verdad).
export { TIPOS_DOC };
