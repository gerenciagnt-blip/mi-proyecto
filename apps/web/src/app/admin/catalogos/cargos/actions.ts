'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { CargoSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

export async function createCargoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = CargoSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').toUpperCase().trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    actividadEconomicaId: String(formData.get('actividadEconomicaId') ?? '').trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.cargo.create({ data: parsed.data });
  } catch (e) {
    return {
      error: e instanceof Error && e.message.includes('Unique') ? 'Código duplicado' : 'Error',
    };
  }

  revalidatePath('/admin/catalogos/cargos');
  return { ok: true };
}

export async function toggleCargoAction(id: string) {
  await requireAdmin();
  const c = await prisma.cargo.findUnique({ where: { id } });
  if (!c) return;
  await prisma.cargo.update({ where: { id }, data: { active: !c.active } });
  revalidatePath('/admin/catalogos/cargos');
}
