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

export const EmpresaCreateSchema = z.object({
  nit: z
    .string()
    .min(5, 'Mínimo 5 caracteres')
    .max(20)
    .regex(/^[0-9-]+$/, 'Solo números y guión'),
  nombre: z.string().min(1, 'Requerido').max(200),
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
