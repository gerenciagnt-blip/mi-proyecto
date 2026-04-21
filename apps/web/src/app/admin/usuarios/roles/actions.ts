'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import type { Role } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { ACCIONES, MODULOS } from '@/lib/permisos';

export type ActionState = { error?: string; ok?: boolean };

const VALID_MODULE_KEYS = new Set(MODULOS.map((m) => m.key));
const VALID_ACCIONES = new Set<string>(ACCIONES);

export async function savePermisosAction(
  role: Role,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  if (role === 'ADMIN') {
    return { error: 'ADMIN tiene todos los permisos por defecto (no editable)' };
  }

  const selected = formData.getAll('perm').map(String);

  const data: { role: Role; modulo: string; accion: string }[] = [];
  for (const s of selected) {
    const [modulo, accion] = s.split('::');
    if (!modulo || !accion) continue;
    if (!VALID_MODULE_KEYS.has(modulo)) continue;
    if (!VALID_ACCIONES.has(accion)) continue;
    data.push({ role, modulo, accion });
  }

  await prisma.$transaction([
    prisma.permiso.deleteMany({ where: { role } }),
    ...(data.length ? [prisma.permiso.createMany({ data, skipDuplicates: true })] : []),
  ]);

  revalidatePath('/admin/usuarios/roles');
  return { ok: true };
}
