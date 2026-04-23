'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';

export type ActionState = {
  error?: string;
  ok?: boolean;
  afectadas?: number;
};

const Schema = z.object({
  valor: z.coerce.number().positive('El valor debe ser mayor a 0'),
});

export async function saveSmlvAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = Schema.safeParse({
    valor: String(formData.get('valor') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Valor inválido' };

  const nuevoValor = parsed.data.valor;

  // Cascada: actualizar TODAS las afiliaciones con salario < nuevo SMLV
  const [, updated] = await prisma.$transaction([
    prisma.smlvConfig.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', valor: nuevoValor, vigenteDesde: new Date() },
      update: { valor: nuevoValor, vigenteDesde: new Date() },
    }),
    prisma.afiliacion.updateMany({
      where: { salario: { lt: nuevoValor } },
      data: { salario: nuevoValor },
    }),
  ]);

  revalidatePath('/admin/catalogos/smlv');
  revalidatePath('/admin/base-datos');
  return { ok: true, afectadas: updated.count };
}
