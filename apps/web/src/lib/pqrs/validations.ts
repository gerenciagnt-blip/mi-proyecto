import { z } from 'zod';

export const PqrsTipoEnum = z.enum(['PETICION', 'QUEJA', 'RECLAMO', 'SUGERENCIA', 'FELICITACION']);

/** Schema de creación pública desde la landing — sin auth. */
export const PqrsCrearSchema = z.object({
  tipo: PqrsTipoEnum,
  tipoDocumento: z.enum(['CC', 'CE', 'NIT', 'PAS', 'TI', 'RC', 'NIP']),
  numeroDocumento: z
    .string()
    .trim()
    .min(4, 'Mínimo 4 caracteres')
    .max(20)
    .regex(/^[A-Z0-9]+$/i, 'Sin espacios ni símbolos'),
  nombres: z.string().trim().min(1, 'Nombres requeridos').max(100),
  apellidos: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  email: z.string().trim().toLowerCase().email('Email inválido').max(150),
  telefono: z
    .string()
    .trim()
    .min(7, 'Teléfono muy corto')
    .max(25)
    .regex(/^[0-9+()\-\s]+$/, 'Teléfono inválido'),
  empresaNombre: z
    .string()
    .trim()
    .max(150)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  asunto: z.string().trim().min(5, 'Asunto muy corto').max(200),
  descripcion: z.string().trim().min(20, 'Descripción muy corta (mín. 20 caracteres)').max(5000),
});

export type PqrsCrearInput = z.infer<typeof PqrsCrearSchema>;
