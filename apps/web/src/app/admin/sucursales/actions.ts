'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { SucursalCreateSchema, SucursalUpdateSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

export async function createSucursalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = SucursalCreateSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').toUpperCase().trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  try {
    await prisma.sucursal.create({ data: parsed.data });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('Unique')
      ? 'Ya existe una sucursal con ese código'
      : 'Error al crear sucursal';
    return { error: msg };
  }

  revalidatePath('/admin/sucursales');
  return { ok: true };
}

export async function updateSucursalAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = SucursalUpdateSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').toUpperCase().trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    active: formData.get('active') === 'on',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  try {
    await prisma.sucursal.update({ where: { id }, data: parsed.data });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('Unique')
      ? 'Código duplicado'
      : 'Error al actualizar';
    return { error: msg };
  }

  revalidatePath('/admin/sucursales');
  redirect('/admin/sucursales');
}

export async function toggleSucursalAction(id: string) {
  await requireAdmin();
  const s = await prisma.sucursal.findUnique({ where: { id } });
  if (!s) return;
  await prisma.sucursal.update({ where: { id }, data: { active: !s.active } });
  revalidatePath('/admin/sucursales');
}

export async function toggleBloqueoMoraAction(id: string) {
  await requireAdmin();
  const s = await prisma.sucursal.findUnique({ where: { id } });
  if (!s) return;
  await prisma.sucursal.update({
    where: { id },
    data: { bloqueadaPorMora: !s.bloqueadaPorMora },
  });
  revalidatePath('/admin/sucursales');
}
