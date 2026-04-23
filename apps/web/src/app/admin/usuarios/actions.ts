'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import {
  UserCreateSchema,
  UserUpdateSchema,
  UserPasswordSchema,
} from '@/lib/validations';
import { titleCase } from '@/lib/text';

export type ActionState = { error?: string; ok?: boolean };

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const role = String(formData.get('role') ?? '');
  const sucursalRaw = String(formData.get('sucursalId') ?? '');
  const parsed = UserCreateSchema.safeParse({
    email: String(formData.get('email') ?? '').toLowerCase().trim(),
    name: titleCase(String(formData.get('name') ?? '').trim()),
    password: String(formData.get('password') ?? ''),
    role,
    sucursalId: role === 'ADMIN' ? null : sucursalRaw || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
        sucursalId: parsed.data.sucursalId,
      },
    });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('Unique')
      ? 'Ya existe un usuario con ese email'
      : 'Error al crear usuario';
    return { error: msg };
  }

  revalidatePath('/admin/usuarios');
  return { ok: true };
}

export async function updateUserAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdmin();
  const esSelf = session.user.id === id;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return { error: 'Usuario no existe' };

  // Protección auto-cambio: si se está editando el propio usuario, forzar
  // rol/sucursal/active a los valores actuales (ignorando el form), para
  // evitar que se quite su propio acceso por accidente o manipulación.
  const role = esSelf ? existing.role : String(formData.get('role') ?? '');
  const sucursalRaw = esSelf
    ? (existing.sucursalId ?? '')
    : String(formData.get('sucursalId') ?? '');
  const active = esSelf ? existing.active : formData.get('active') === 'on';

  const parsed = UserUpdateSchema.safeParse({
    name: titleCase(String(formData.get('name') ?? '').trim()),
    role,
    sucursalId: role === 'ADMIN' ? null : sucursalRaw || null,
    active,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  try {
    await prisma.user.update({ where: { id }, data: parsed.data });
  } catch {
    return { error: 'Error al actualizar usuario' };
  }

  revalidatePath('/admin/usuarios');
  redirect('/admin/usuarios');
}

export async function toggleUserAction(id: string) {
  const session = await requireAdmin();
  if (session.user.id === id) return; // no permitir auto-desactivar
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return;
  await prisma.user.update({ where: { id }, data: { active: !u.active } });
  revalidatePath('/admin/usuarios');
}

export async function resetPasswordAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = UserPasswordSchema.safeParse({
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Contraseña inválida' };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  revalidatePath('/admin/usuarios');
  return { ok: true };
}
