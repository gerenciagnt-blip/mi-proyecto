'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { PlanSgssSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

export async function createPlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = PlanSgssSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').toUpperCase().trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim(),
    incluyeEps: formData.get('incluyeEps'),
    incluyeAfp: formData.get('incluyeAfp'),
    incluyeArl: formData.get('incluyeArl'),
    incluyeCcf: formData.get('incluyeCcf'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  // Al menos una entidad incluida
  const { incluyeEps, incluyeAfp, incluyeArl, incluyeCcf } = parsed.data;
  if (!incluyeEps && !incluyeAfp && !incluyeArl && !incluyeCcf) {
    return { error: 'El plan debe incluir al menos una entidad SGSS' };
  }

  try {
    await prisma.planSgss.create({ data: parsed.data });
  } catch (e) {
    return {
      error: e instanceof Error && e.message.includes('Unique') ? 'Código duplicado' : 'Error',
    };
  }

  revalidatePath('/admin/catalogos/planes');
  return { ok: true };
}

export async function togglePlanAction(id: string) {
  await requireAdmin();
  const p = await prisma.planSgss.findUnique({ where: { id } });
  if (!p) return;
  await prisma.planSgss.update({ where: { id }, data: { active: !p.active } });
  revalidatePath('/admin/catalogos/planes');
}
