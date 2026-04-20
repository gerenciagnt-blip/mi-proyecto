'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { EmpresaCreateSchema, EmpresaUpdateSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

export async function createEmpresaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = EmpresaCreateSchema.safeParse({
    nit: String(formData.get('nit') ?? '').trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  try {
    await prisma.empresa.create({ data: parsed.data });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('Unique')
      ? 'Ya existe una empresa con ese NIT'
      : 'Error al crear empresa';
    return { error: msg };
  }

  revalidatePath('/admin/empresas');
  return { ok: true };
}

export async function updateEmpresaAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = EmpresaUpdateSchema.safeParse({
    nit: String(formData.get('nit') ?? '').trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    active: formData.get('active') === 'on',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  try {
    await prisma.empresa.update({ where: { id }, data: parsed.data });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('Unique')
      ? 'NIT duplicado'
      : 'Error al actualizar';
    return { error: msg };
  }

  revalidatePath('/admin/empresas');
  redirect('/admin/empresas');
}

export async function toggleEmpresaAction(id: string) {
  await requireAdmin();
  const e = await prisma.empresa.findUnique({ where: { id } });
  if (!e) return;
  await prisma.empresa.update({ where: { id }, data: { active: !e.active } });
  revalidatePath('/admin/empresas');
}
