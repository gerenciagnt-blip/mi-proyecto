import { z } from 'zod';
import type { IncapacidadEstado } from '@pila/db';

export const IncapacidadTipoEnum = z.enum([
  'ENFERMEDAD_GENERAL',
  'LICENCIA_MATERNIDAD',
  'LICENCIA_PATERNIDAD',
  'ACCIDENTE_TRABAJO',
  'ACCIDENTE_TRANSITO_SOAT',
]);

export const IncapacidadDocumentoTipoEnum = z.enum([
  'COPIA_CEDULA',
  'CERTIFICADO_INCAPACIDAD',
  'HISTORIA_CLINICA',
  'CERTIFICADO_BANCARIO',
  'AUTORIZACION_PAGO_TERCEROS',
  'FURIPS_SOAT',
]);

/** Etiquetas legibles para UI. */
export const TIPO_LABEL: Record<z.infer<typeof IncapacidadTipoEnum>, string> = {
  ENFERMEDAD_GENERAL: 'Enfermedad General',
  LICENCIA_MATERNIDAD: 'Licencia de Maternidad',
  LICENCIA_PATERNIDAD: 'Licencia de Paternidad',
  ACCIDENTE_TRABAJO: 'Accidente de Trabajo',
  ACCIDENTE_TRANSITO_SOAT: 'Accidente de Tránsito (SOAT)',
};

export const DOC_TIPO_LABEL: Record<z.infer<typeof IncapacidadDocumentoTipoEnum>, string> = {
  COPIA_CEDULA: 'Copia de cédula',
  CERTIFICADO_INCAPACIDAD: 'Certificado de incapacidad',
  HISTORIA_CLINICA: 'Historia clínica',
  CERTIFICADO_BANCARIO: 'Certificado bancario',
  AUTORIZACION_PAGO_TERCEROS: 'Autorización pago a terceros',
  FURIPS_SOAT: 'FURIPS · Copia SOAT',
};

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
};

export const ESTADO_TONE: Record<IncapacidadEstado, string> = {
  RADICADA: 'bg-sky-50 text-sky-700 ring-sky-200',
  EN_REVISION: 'bg-amber-50 text-amber-700 ring-amber-200',
  APROBADA: 'bg-violet-50 text-violet-700 ring-violet-200',
  PAGADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RECHAZADA: 'bg-red-50 text-red-700 ring-red-200',
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
