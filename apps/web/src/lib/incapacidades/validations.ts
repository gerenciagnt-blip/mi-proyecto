import { z } from 'zod';
import type { IncapacidadEstado } from '@pila/db';

export const IncapacidadTipoEnum = z.enum([
  'ENFERMEDAD_GENERAL',
  'LICENCIA_MATERNIDAD',
  'LICENCIA_PATERNIDAD',
  'ACCIDENTE_TRABAJO',
  'ACCIDENTE_TRANSITO_SOAT',
]);

/** Tipos médicos / administrativos — flujo regular (no confidencial). */
export const DOC_TIPOS_MEDICOS = [
  'COPIA_CEDULA',
  'CERTIFICADO_INCAPACIDAD',
  'HISTORIA_CLINICA',
  'CERTIFICADO_BANCARIO',
  'AUTORIZACION_PAGO_TERCEROS',
  'FURIPS_SOAT',
] as const;

/** Tipos jurídicos — solo se suben con `confidencial=true` desde el flujo legal. */
export const DOC_TIPOS_JURIDICOS = [
  'DERECHO_PETICION',
  'TUTELA',
  'DESACATO',
  'RESOLUCION',
  'OTRO_JURIDICO',
] as const;

export const IncapacidadDocumentoTipoEnum = z.enum([...DOC_TIPOS_MEDICOS, ...DOC_TIPOS_JURIDICOS]);

/** Subset Zod para validar uploads médicos — rechaza tipos jurídicos. */
export const IncapacidadDocumentoTipoMedicoEnum = z.enum(DOC_TIPOS_MEDICOS);
/** Subset Zod para validar uploads jurídicos — rechaza tipos médicos. */
export const IncapacidadDocumentoTipoJuridicoEnum = z.enum(DOC_TIPOS_JURIDICOS);

/** Etiquetas legibles para UI. */
export const TIPO_LABEL: Record<z.infer<typeof IncapacidadTipoEnum>, string> = {
  ENFERMEDAD_GENERAL: 'Enfermedad General',
  LICENCIA_MATERNIDAD: 'Licencia de Maternidad',
  LICENCIA_PATERNIDAD: 'Licencia de Paternidad',
  ACCIDENTE_TRABAJO: 'Accidente de Trabajo',
  ACCIDENTE_TRANSITO_SOAT: 'Accidente de Tránsito (SOAT)',
};

export const DOC_TIPO_LABEL: Record<z.infer<typeof IncapacidadDocumentoTipoEnum>, string> = {
  // Médicos / administrativos
  COPIA_CEDULA: 'Copia de cédula',
  CERTIFICADO_INCAPACIDAD: 'Certificado de incapacidad',
  HISTORIA_CLINICA: 'Historia clínica',
  CERTIFICADO_BANCARIO: 'Certificado bancario',
  AUTORIZACION_PAGO_TERCEROS: 'Autorización pago a terceros',
  FURIPS_SOAT: 'FURIPS · Copia SOAT',
  // Jurídicos
  DERECHO_PETICION: 'Derecho de petición',
  TUTELA: 'Tutela',
  DESACATO: 'Desacato',
  RESOLUCION: 'Resolución',
  OTRO_JURIDICO: 'Otros documentos',
};

/** Labels solo para los tipos médicos — usar en forms del flujo regular. */
export const DOC_TIPO_MEDICO_LABEL = Object.fromEntries(
  DOC_TIPOS_MEDICOS.map((k) => [k, DOC_TIPO_LABEL[k]]),
) as Record<(typeof DOC_TIPOS_MEDICOS)[number], string>;

/** Labels solo para los tipos jurídicos — usar en forms del flujo legal. */
export const DOC_TIPO_JURIDICO_LABEL = Object.fromEntries(
  DOC_TIPOS_JURIDICOS.map((k) => [k, DOC_TIPO_LABEL[k]]),
) as Record<(typeof DOC_TIPOS_JURIDICOS)[number], string>;

/**
 * Sprint Soporte reorg fase 2 — Etiquetas + tonos centralizados para
 * `IncapacidadEstado`. Antes vivían duplicados en 4 archivos (page de
 * soporte, page de administrativo, [id] de soporte, ver-gestiones).
 * Ahora se importan desde acá para mantener consistencia.
 */
export const ESTADO_LABEL: Record<IncapacidadEstado, string> = {
  RADICADA: 'Radicada',
  EN_REVISION: 'En revisión',
  APROBADA: 'Aprobada',
  PAGADA: 'Pagada',
  RECHAZADA: 'Rechazada',
  TRASLADO_A_JURIDICO: 'Traslado a jurídico',
  EN_PROCESO_JURIDICO: 'En proceso jurídico',
};

export const ESTADO_TONE: Record<IncapacidadEstado, string> = {
  RADICADA: 'bg-sky-50 text-sky-700 ring-sky-200',
  EN_REVISION: 'bg-amber-50 text-amber-700 ring-amber-200',
  APROBADA: 'bg-violet-50 text-violet-700 ring-violet-200',
  PAGADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RECHAZADA: 'bg-red-50 text-red-700 ring-red-200',
  // Estados jurídicos en tono índigo — diferenciados visualmente del flujo
  // regular para que el operador identifique de un vistazo casos legales.
  TRASLADO_A_JURIDICO: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  EN_PROCESO_JURIDICO: 'bg-indigo-100 text-indigo-800 ring-indigo-300',
};

export const IncapacidadRadicarSchema = z
  .object({
    tipo: IncapacidadTipoEnum,
    tipoDocumento: z.enum(['CC', 'CE', 'NIT', 'PAS', 'TI', 'RC', 'NIP']),
    numeroDocumento: z
      .string()
      .trim()
      .min(4, 'Mínimo 4 caracteres')
      .max(20)
      .regex(/^[A-Z0-9]+$/i, 'Sin espacios ni símbolos'),
    fechaInicio: z.coerce.date({ message: 'Fecha inicio inválida' }),
    fechaFin: z.coerce.date({ message: 'Fecha fin inválida' }),
    observaciones: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
  })
  .refine((v) => v.fechaFin >= v.fechaInicio, {
    message: 'La fecha fin debe ser igual o posterior a la fecha inicio',
    path: ['fechaFin'],
  })
  .refine(
    (v) => {
      const ms = v.fechaFin.getTime() - v.fechaInicio.getTime();
      const dias = Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
      return dias <= 540;
    },
    {
      message: 'La incapacidad excede el máximo de 540 días',
      path: ['fechaFin'],
    },
  );

export type IncapacidadRadicarData = z.infer<typeof IncapacidadRadicarSchema>;
