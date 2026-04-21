'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { ServicioAdicionalSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

export async function createServicioAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = ServicioAdicionalSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').toUpperCase().trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim(),
    precio: String(formData.get('precio') ?? '0'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.servicioAdicional.create({ data: parsed.data });
  } catch (e) {
    return {
      error: e instanceof Error && e.message.includes('Unique') ? 'Código duplicado' : 'Error',
    };
  }

  revalidatePath('/admin/catalogos/servicios');
  return { ok: true };
}

export async function toggleServicioAction(id: string) {
  await requireAdmin();
  const s = await prisma.servicioAdicional.findUnique({ where: { id } });
  if (!s) return;
  await prisma.servicioAdicional.update({ where: { id }, data: { active: !s.active } });
  revalidatePath('/admin/catalogos/servicios');
}
