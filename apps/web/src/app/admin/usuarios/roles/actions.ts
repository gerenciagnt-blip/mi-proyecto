'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@pila/db';
import type { Role } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { ACCIONES, MODULOS } from '@/lib/permisos';

export type ActionState = { error?: string; ok?: boolean };

const VALID_MODULE_KEYS = new Set(MODULOS.map((m) => m.key));
const VALID_ACCIONES = new Set<string>(ACCIONES);

// ============ Permisos de roles de sistema (enum) ============

export async function savePermisosAction(
  role: Role,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  if (role === 'ADMIN') {
    return { error: 'ADMIN tiene todos los permisos por defecto (no editable)' };
  }

  const selected = formData.getAll('perm').map(String);
  const data: { role: Role; modulo: string; accion: string }[] = [];
  for (const s of selected) {
    const [modulo, accion] = s.split('::');
    if (!modulo || !accion) continue;
    if (!VALID_MODULE_KEYS.has(modulo) || !VALID_ACCIONES.has(accion)) continue;
    data.push({ role, modulo, accion });
  }

  await prisma.$transaction([
    prisma.permiso.deleteMany({ where: { role } }),
    ...(data.length ? [prisma.permiso.createMany({ data, skipDuplicates: true })] : []),
  ]);

  revalidatePath('/admin/usuarios/roles');
  return { ok: true };
}

// ============ Roles personalizados (tabla RolCustom) ============

const RolCustomSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre requerido').max(100),
  descripcion: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  basedOn: z.enum(['ALIADO_OWNER', 'ALIADO_USER']),
});

export async function createRolCustomAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = RolCustomSchema.safeParse({
    nombre: String(formData.get('nombre') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim(),
    basedOn: String(formData.get('basedOn') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    const rol = await prisma.rolCustom.create({ data: parsed.data });
    revalidatePath('/admin/usuarios/roles');
    redirect(`/admin/usuarios/roles/${rol.id}`);
  } catch (e) {
    // redirect() throws NEXT_REDIRECT → dejar pasar
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
    return {
      error:
        e instanceof Error && e.message.includes('Unique')
          ? 'Ya existe un rol con ese nombre'
          : 'Error al crear rol',
    };
  }
}

export async function updateRolCustomAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = RolCustomSchema.safeParse({
    nombre: String(formData.get('nombre') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim(),
    basedOn: String(formData.get('basedOn') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  // Permisos seleccionados (matrix)
  const selected = formData.getAll('perm').map(String);
  const permisos: { modulo: string; accion: string }[] = [];
  for (const s of selected) {
    const [modulo, accion] = s.split('::');
    if (!modulo || !accion) continue;
    if (!VALID_MODULE_KEYS.has(modulo) || !VALID_ACCIONES.has(accion)) continue;
    permisos.push({ modulo, accion });
  }

  try {
    await prisma.$transaction([
      prisma.rolCustom.update({ where: { id }, data: parsed.data }),
      prisma.permisoCustom.deleteMany({ where: { rolCustomId: id } }),
      ...(permisos.length
        ? [
            prisma.permisoCustom.createMany({
              data: permisos.map((p) => ({ rolCustomId: id, ...p })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes('Unique')
          ? 'Ya existe un rol con ese nombre'
          : 'Error al guardar',
    };
  }

  revalidatePath('/admin/usuarios/roles');
  revalidatePath(`/admin/usuarios/roles/${id}`);
  return { ok: true };
}

export async function toggleRolCustomAction(id: string) {
  await requireAdmin();
  const r = await prisma.rolCustom.findUnique({ where: { id } });
  if (!r) return;
  await prisma.rolCustom.update({ where: { id }, data: { active: !r.active } });
  revalidatePath('/admin/usuarios/roles');
}

export async function deleteRolCustomAction(id: string) {
  await requireAdmin();
  await prisma.rolCustom.delete({ where: { id } });
  revalidatePath('/admin/usuarios/roles');
  redirect('/admin/usuarios/roles');
}
