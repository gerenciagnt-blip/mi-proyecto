import { z } from 'zod';

// IMPORTANTE: este archivo se importa desde Client Components — NO debe
// hacer imports runtime de `@pila/db` (Prisma) porque arrastra al cliente
// Prisma al bundle del navegador. Los valores de los enums se replican
// como tuplas literales `as const` para que el shape sea idéntico al
// enum del schema sin acoplar a Prisma en runtime.

/** Lateralidad de las partes del cuerpo afectadas. */
export const LATERALIDADES = ['DERECHA', 'IZQUIERDA', 'AMBAS', 'NA'] as const;
export type Lateralidad = (typeof LATERALIDADES)[number];

export const LATERALIDAD_LABEL: Record<Lateralidad, string> = {
  DERECHA: 'Derecha',
  IZQUIERDA: 'Izquierda',
  AMBAS: 'Ambas',
  NA: 'No aplica',
};

/** Tipos de documento aceptados por el formato AT. */
export const TIPOS_DOC_AT = ['CC', 'CE', 'PEP', 'PPT', 'TI'] as const;
export type TipoDocAT = (typeof TIPOS_DOC_AT)[number];

export const TIPO_DOC_AT_LABEL: Record<TipoDocAT, string> = {
  CC: 'Cédula de Ciudadanía',
  CE: 'Cédula de Extranjería',
  PEP: 'Permiso Especial de Permanencia',
  PPT: 'Permiso Por Protección Temporal',
  TI: 'Tarjeta de Identidad',
};

/** Estados del reporte AT (mismas claves que el enum Prisma `ReporteATEstado`). */
export const ESTADOS_REPORTE_AT = ['RADICADO', 'EN_REVISION', 'CERRADO', 'ANULADO'] as const;
export type ReporteATEstadoLit = (typeof ESTADOS_REPORTE_AT)[number];

export const ESTADO_LABEL: Record<ReporteATEstadoLit, string> = {
  RADICADO: 'Radicado',
  EN_REVISION: 'En revisión',
  CERRADO: 'Cerrado',
  ANULADO: 'Anulado',
};

/** Color (Tailwind) para los chips de estado. */
export const ESTADO_TONE: Record<ReporteATEstadoLit, string> = {
  RADICADO: 'bg-sky-50 text-sky-700 ring-sky-200',
  EN_REVISION: 'bg-amber-50 text-amber-700 ring-amber-200',
  CERRADO: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ANULADO: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/** Causas del reporte AT (mismas claves que el enum Prisma `ReporteATCausa`). */
export const CAUSAS_REPORTE_AT = [
  'IMPRUDENCIA_PROPIA',
  'IMPRUDENCIA_OTROS',
  'FALTA_INSTRUCCIONES',
  'POCA_EXPERIENCIA',
  'MEDIDAS_INADECUADAS',
  'RIESGOS_PROPIOS',
  'OTROS',
] as const;
export type ReporteATCausaLit = (typeof CAUSAS_REPORTE_AT)[number];

export const CAUSA_LABEL: Record<ReporteATCausaLit, string> = {
  IMPRUDENCIA_PROPIA: 'Imprudencia propia',
  IMPRUDENCIA_OTROS: 'Imprudencia de otros',
  FALTA_INSTRUCCIONES: 'Falta de instrucciones',
  POCA_EXPERIENCIA: 'Poca experiencia',
  MEDIDAS_INADECUADAS: 'Medidas preventivas inadecuadas',
  RIESGOS_PROPIOS: 'Riesgos propios de la actividad',
  OTROS: 'Otros',
};

/** Item de partes del cuerpo afectadas. */
export const partesCuerpoItemSchema = z.object({
  parte: z.string().trim().min(2, 'Indica la parte del cuerpo').max(80),
  lateralidad: z.enum(LATERALIDADES).default('NA'),
});
export type PartesCuerpoItem = z.infer<typeof partesCuerpoItemSchema>;

/** Hora HH:mm 24h. */
const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Schema completo para crear un Reporte AT desde el formulario del aliado. */
export const crearReporteAtSchema = z
  .object({
    sucursalId: z.string().min(1),

    fechaAccidente: z.coerce.date(),
    horaAccidente: z.string().regex(horaRegex, 'Hora inválida (HH:mm)'),
    horaInicioJornada: z.string().regex(horaRegex, 'Hora inválida (HH:mm)'),
    lugar: z.string().trim().min(2).max(200),
    ciudadAccidente: z.string().trim().min(2).max(120),
    departamentoAccidente: z.string().trim().min(2).max(120),

    trabajadorNombre: z.string().trim().min(3).max(200),
    trabajadorTipoDoc: z.enum(TIPOS_DOC_AT),
    trabajadorNumeroDoc: z.string().trim().min(3).max(30),
    trabajadorFondoPension: z.string().trim().max(120).optional().or(z.literal('')),
    trabajadorEps: z.string().trim().max(120).optional().or(z.literal('')),
    trabajadorCargo: z.string().trim().min(2).max(120),
    trabajadorExperienciaMeses: z.coerce.number().int().min(0).max(720).optional().nullable(),
    trabajadorTelefono: z.string().trim().max(40).optional().or(z.literal('')),
    trabajadorDireccion: z.string().trim().max(200).optional().or(z.literal('')),
    trabajadorCiudadResidencia: z.string().trim().max(120).optional().or(z.literal('')),
    trabajadorEstadoCivil: z.string().trim().max(40).optional().or(z.literal('')),
    trabajadorEdad: z.coerce.number().int().min(0).max(120).optional().nullable(),

    empresaRazonSocial: z.string().trim().min(2).max(200),
    empresaNit: z.string().trim().min(3).max(40),

    hechosQueOcurrio: z.string().trim().min(5).max(4000),
    hechosCuandoDonde: z.string().trim().min(5).max(4000),
    hechosComoOcurrio: z.string().trim().min(5).max(4000),

    causas: z.array(z.enum(CAUSAS_REPORTE_AT)).default([]),
    causasOtros: z.string().trim().max(500).optional().or(z.literal('')),

    partesCuerpo: z.array(partesCuerpoItemSchema).min(1, 'Indica al menos una parte del cuerpo'),

    responsableNombre: z.string().trim().min(2).max(160),
    responsableTelefono: z.string().trim().min(5).max(40),
    responsableCorreo: z.string().trim().email(),

    responsable2Nombre: z.string().trim().max(160).optional().or(z.literal('')),
    responsable2Telefono: z.string().trim().max(40).optional().or(z.literal('')),
    responsable2Correo: z
      .string()
      .trim()
      .max(160)
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Correo inválido'),

    trabajadorCorreoFirma: z
      .string()
      .trim()
      .max(160)
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Correo inválido'),

    fechaElaboracion: z.coerce.date(),
  })
  .superRefine((d, ctx) => {
    if (d.causas.includes('OTROS') && !d.causasOtros?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['causasOtros'],
        message: 'Especifica la causa cuando seleccionas "Otros"',
      });
    }
  });

export type CrearReporteAtInput = z.infer<typeof crearReporteAtSchema>;

/** Schema para cambiar el estado desde Soporte (con observación obligatoria). */
export const cambiarEstadoReporteAtSchema = z.object({
  reporteAtId: z.string().min(1),
  nuevoEstado: z.enum(ESTADOS_REPORTE_AT),
  descripcion: z.string().trim().min(3).max(2000),
});
export type CambiarEstadoReporteAtInput = z.infer<typeof cambiarEstadoReporteAtSchema>;

/** Devuelve "Lunes", "Martes"… en español a partir de una fecha (UTC-safe). */
export function diaSemanaEs(fecha: Date): string {
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  // Usamos UTC para evitar shifts por timezone — los inputs date son UTC.
  return dias[fecha.getUTCDay()] ?? '';
}
