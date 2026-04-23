'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';

export type ActionState = { error?: string; ok?: boolean };

export async function updateUserEmpresasAction(
  userId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: 'Usuario no encontrado' };
  if (user.role === 'ADMIN') return { error: 'Admins no requieren asignación de empresas' };

  const selected = new Set(formData.getAll('empresaId').map(String));

  const current = await prisma.usuarioEmpresa.findMany({
    where: { userId },
    select: { empresaId: true },
  });
  const currentSet = new Set(current.map((c) => c.empresaId));

  const toAdd = [...selected].filter((id) => !currentSet.has(id));
  const toRemove = [...currentSet].filter((id) => !selected.has(id));

  await prisma.$transaction([
    ...(toAdd.length
      ? [
          prisma.usuarioEmpresa.createMany({
            data: toAdd.map((empresaId) => ({ userId, empresaId })),
          }),
        ]
      : []),
    ...(toRemove.length
      ? [
          prisma.usuarioEmpresa.deleteMany({
            where: { userId, empresaId: { in: toRemove } },
          }),
        ]
      : []),
  ]);

  revalidatePath(`/admin/usuarios/${userId}/empresas`);
  revalidatePath('/admin/usuarios');
  return { ok: true };
}
