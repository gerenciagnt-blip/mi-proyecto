'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { MedioPagoSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

export async function createMedioPagoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = MedioPagoSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').toUpperCase().trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.medioPago.create({ data: parsed.data });
  } catch (e) {
    return {
      error: e instanceof Error && e.message.includes('Unique') ? 'Código duplicado' : 'Error',
    };
  }

  revalidatePath('/admin/catalogos/medios-pago');
  return { ok: true };
}

export async function toggleMedioPagoAction(id: string) {
  await requireAdmin();
  const m = await prisma.medioPago.findUnique({ where: { id } });
  if (!m) return;
  await prisma.medioPago.update({ where: { id }, data: { active: !m.active } });
  revalidatePath('/admin/catalogos/medios-pago');
}
