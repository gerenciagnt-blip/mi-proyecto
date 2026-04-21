import { z } from 'zod';

export const SucursalCreateSchema = z.object({
  codigo: z
    .string()
    .min(1, 'Requerido')
    .max(20)
    .regex(/^[A-Z0-9-]+$/i, 'Solo letras, números y guión'),
  nombre: z.string().min(1, 'Requerido').max(200),
});

export const SucursalUpdateSchema = SucursalCreateSchema.extend({
  active: z.boolean().optional(),
});

export const TipoPersonaEnum = z.enum(['NATURAL', 'JURIDICA']);
export const TipoDocumentoEnum = z.enum(['CC', 'CE', 'NIT', 'PAS', 'TI', 'RC', 'NIP']);

const optionalTrim = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

export const EmpresaCreateSchema = z.object({
  // Identificación
  nit: z
    .string()
    .trim()
    .min(5, 'Mínimo 5 caracteres')
    .max(20)
    .regex(/^[0-9]+$/, 'Solo números (sin DV ni guión)'),
  dv: optionalTrim.pipe(z.string().regex(/^[0-9]$/, 'DV debe ser 1 dígito').optional()),
  nombre: z.string().trim().min(1, 'Razón social requerida').max(200),
  nombreComercial: optionalTrim,
  tipoPersona: TipoPersonaEnum,

  // Representante legal
  repLegalTipoDoc: TipoDocumentoEnum,
  repLegalNumeroDoc: z.string().trim().min(4, 'Mínimo 4 dígitos').max(20),
  repLegalNombre: z.string().trim().min(1, 'Requerido').max(200),

  // Contacto
  direccion: z.string().trim().min(1, 'Requerido').max(200),
  ciudad: z.string().trim().min(1, 'Requerido').max(100),
  departamento: z.string().trim().min(1, 'Requerido').max(100),
  telefono: z.string().trim().min(5, 'Mínimo 5 dígitos').max(30),
  email: z.string().trim().email('Correo no válido'),

  // PILA
  ciiuPrincipal: z
    .string()
    .trim()
    .regex(/^[0-9]{4}$/, 'Código CIIU de 4 dígitos'),
  arlId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? null : v))
    .nullable(),
});

export const EmpresaUpdateSchema = EmpresaCreateSchema.extend({
  active: z.boolean().optional(),
});

export const RoleEnum = z.enum(['ADMIN', 'ALIADO_OWNER', 'ALIADO_USER']);

export const UserCreateSchema = z
  .object({
    email: z.string().email('Correo no válido'),
    name: z.string().min(1, 'Requerido').max(200),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    role: RoleEnum,
    sucursalId: z.string().nullable(),
  })
  .refine((v) => v.role === 'ADMIN' || !!v.sucursalId, {
    message: 'Sucursal obligatoria para roles de aliado',
    path: ['sucursalId'],
  });

export const UserUpdateSchema = z
  .object({
    name: z.string().min(1).max(200),
    role: RoleEnum,
    sucursalId: z.string().nullable(),
    active: z.boolean(),
  })
  .refine((v) => v.role === 'ADMIN' || !!v.sucursalId, {
    message: 'Sucursal obligatoria para roles de aliado',
    path: ['sucursalId'],
  });

export const UserPasswordSchema = z.object({
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

// --- Catálogos ---

export const NivelRiesgoEnum = z.enum(['I', 'II', 'III', 'IV', 'V']);

export const TipoEntidadSgssEnum = z.enum(['EPS', 'AFP', 'ARL', 'CCF']);
export type TipoEntidadSgssValue = z.infer<typeof TipoEntidadSgssEnum>;

export const EntidadSgssSchema = z.object({
  tipo: TipoEntidadSgssEnum,
  codigo: z.string().trim().min(1, 'Requerido').max(30),
  nombre: z.string().trim().min(1, 'Requerido').max(200),
  codigoMinSalud: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  nit: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

export const ActividadSchema = z.object({
  codigoCiiu: z.string().trim().regex(/^[0-9]{4}$/, 'CIIU de 4 dígitos'),
  descripcion: z.string().trim().min(1).max(300),
});

export const TipoCotizanteSchema = z.object({
  codigo: z.string().trim().min(1, 'Requerido').max(10),
  nombre: z.string().trim().min(1, 'Requerido').max(200),
});

export const SubtipoSchema = z.object({
  codigo: z.string().trim().min(1, 'Requerido').max(10),
  nombre: z.string().trim().min(1, 'Requerido').max(200),
});

// --- Catálogos Fase 1.6.2 ---

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

export const CargoSchema = z.object({
  codigo: z.string().trim().min(1, 'Requerido').max(30),
  nombre: z.string().trim().min(1, 'Requerido').max(200),
  actividadEconomicaId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v !== '' ? v : null))
    .nullable(),
});

export const AsesorSchema = z.object({
  codigo: z.string().trim().min(1, 'Requerido').max(20),
  nombre: z.string().trim().min(1, 'Requerido').max(200),
  email: optional.pipe(z.string().email('Correo no válido').optional()),
  telefono: optional,
});

export const MedioPagoSchema = z.object({
  codigo: z.string().trim().min(1, 'Requerido').max(20),
  nombre: z.string().trim().min(1, 'Requerido').max(200),
});

export const ServicioAdicionalSchema = z.object({
  codigo: z.string().trim().min(1, 'Requerido').max(20),
  nombre: z.string().trim().min(1, 'Requerido').max(200),
  descripcion: optional,
  precio: z.coerce.number().min(0, 'Precio no puede ser negativo').default(0),
});

// --- Cuenta de Cobro (Fase 1.6.3) ---

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const CuentaCobroSchema = z.object({
  sucursalId: z.string().trim().min(1, 'Sucursal requerida'),
  codigo: z.string().trim().min(1, 'Requerido').max(30),
  razonSocial: z.string().trim().min(1, 'Requerido').max(200),
  nit: optional,
  dv: optional,
  tipoPersona: z.preprocess(emptyToNull, TipoPersonaEnum.nullable()),
  repLegalTipoDoc: z.preprocess(emptyToNull, TipoDocumentoEnum.nullable()),
  repLegalNumeroDoc: optional,
  repLegalNombre: optional,
  direccion: optional,
  ciudad: optional,
  departamento: optional,
  telefono: optional,
  email: optional.pipe(z.string().email('Correo no válido').optional()),
});

// --- Cotizante + Afiliación (Fase 2.1) ---

export const GeneroEnum = z.enum(['M', 'F', 'O']);
export const EstadoAfiliacionEnum = z.enum(['ACTIVA', 'INACTIVA']);

export const CotizanteSchema = z.object({
  tipoDocumento: TipoDocumentoEnum,
  numeroDocumento: z
    .string()
    .trim()
    .min(4, 'Mínimo 4 dígitos')
    .max(20)
    .regex(/^[A-Z0-9]+$/i, 'Sin espacios ni símbolos'),
  fechaExpedicionDoc: z.coerce.date().nullable().optional(),
  primerNombre: z.string().trim().min(1, 'Requerido').max(100),
  segundoNombre: optional,
  primerApellido: z.string().trim().min(1, 'Requerido').max(100),
  segundoApellido: optional,
  fechaNacimiento: z.coerce.date({ message: 'Fecha inválida' }),
  genero: GeneroEnum,
  telefono: optional,
  celular: optional,
  email: optional.pipe(z.string().email('Correo no válido').optional()),
  direccion: optional,
  departamentoId: z.string().nullable().optional(),
  municipioId: z.string().nullable().optional(),
});

const idOrNull = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v !== '' ? v : null))
  .nullable();

export const AfiliacionSchema = z.object({
  empresaId: z.string().trim().min(1, 'Empresa requerida'),
  cuentaCobroId: idOrNull,
  asesorComercialId: idOrNull,
  tipoCotizanteId: z.string().trim().min(1, 'Tipo de cotizante requerido'),
  subtipoId: idOrNull,
  nivelRiesgo: NivelRiesgoEnum,
  salario: z.coerce.number().min(0, 'Salario no puede ser negativo'),
  valorAdministracion: z
    .string()
    .optional()
    .transform((v) => (v && v !== '' ? Number(v) : null))
    .nullable(),
  fechaIngreso: z.coerce.date({ message: 'Fecha inválida' }),
  comentarios: optional,
  epsId: idOrNull,
  afpId: idOrNull,
  ccfId: idOrNull,
});
