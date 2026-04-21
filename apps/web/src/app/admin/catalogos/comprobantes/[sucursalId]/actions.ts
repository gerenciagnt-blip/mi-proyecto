'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';

export type ActionState = { error?: string; ok?: boolean };

const Schema = z.object({
  nombre: z.string().trim().min(1, 'Requerido').max(200),
  logoUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.string().url('URL no válida').optional()),
  encabezado: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  pieDePagina: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

export async function saveComprobanteAction(
  sucursalId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = Schema.safeParse({
    nombre: String(formData.get('nombre') ?? '').trim(),
    logoUrl: String(formData.get('logoUrl') ?? '').trim(),
    encabezado: String(formData.get('encabezado') ?? '').trim(),
    pieDePagina: String(formData.get('pieDePagina') ?? '').trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalId } });
  if (!sucursal) return { error: 'Sucursal no encontrada' };

  try {
    await prisma.comprobanteFormato.upsert({
      where: { sucursalId },
      create: { sucursalId, ...parsed.data },
      update: parsed.data,
    });
  } catch {
    return { error: 'Error al guardar' };
  }

  revalidatePath('/admin/catalogos/comprobantes');
  revalidatePath(`/admin/catalogos/comprobantes/${sucursalId}`);
  return { ok: true };
}

export async function toggleComprobanteAction(sucursalId: string) {
  await requireAdmin();
  const f = await prisma.comprobanteFormato.findUnique({ where: { sucursalId } });
  if (!f) return;
  await prisma.comprobanteFormato.update({
    where: { sucursalId },
    data: { active: !f.active },
  });
  revalidatePath('/admin/catalogos/comprobantes');
  revalidatePath(`/admin/catalogos/comprobantes/${sucursalId}`);
}
