'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { PlanSgssSchema } from '@/lib/validations';
import { nextPlanSgssCodigo } from '@/lib/consecutivo';

export type ActionState = { error?: string; ok?: boolean };

export async function createPlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = PlanSgssSchema.safeParse({
    nombre: String(formData.get('nombre') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim(),
    incluyeEps: formData.get('incluyeEps'),
    incluyeAfp: formData.get('incluyeAfp'),
    incluyeArl: formData.get('incluyeArl'),
    incluyeCcf: formData.get('incluyeCcf'),
    regimen: formData.get('regimen') ?? 'AMBOS',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const { incluyeEps, incluyeAfp, incluyeArl, incluyeCcf } = parsed.data;
  if (!incluyeEps && !incluyeAfp && !incluyeArl && !incluyeCcf) {
    return { error: 'El plan debe incluir al menos una entidad SGSS' };
  }

  const codigo = await nextPlanSgssCodigo();

  try {
    await prisma.planSgss.create({ data: { ...parsed.data, codigo } });
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes('Unique')
          ? `Código duplicado (${codigo}) — reintenta`
          : 'Error',
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
