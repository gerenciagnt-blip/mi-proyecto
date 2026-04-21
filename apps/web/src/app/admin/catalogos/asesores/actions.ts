'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { AsesorSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

export async function createAsesorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = AsesorSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').toUpperCase().trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    telefono: String(formData.get('telefono') ?? '').trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.asesorComercial.create({ data: parsed.data });
  } catch (e) {
    return {
      error: e instanceof Error && e.message.includes('Unique') ? 'Código duplicado' : 'Error',
    };
  }

  revalidatePath('/admin/catalogos/asesores');
  return { ok: true };
}

export async function toggleAsesorAction(id: string) {
  await requireAdmin();
  const a = await prisma.asesorComercial.findUnique({ where: { id } });
  if (!a) return;
  await prisma.asesorComercial.update({ where: { id }, data: { active: !a.active } });
  revalidatePath('/admin/catalogos/asesores');
}
