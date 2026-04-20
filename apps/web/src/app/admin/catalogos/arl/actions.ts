'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { ArlSchema } from '@/lib/validations';
import { parseExcelFile, newImportResult } from '@/lib/excel';
import type { ImportState } from '../_components/import-form';

export type ActionState = { error?: string; ok?: boolean };

export async function createArlAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = ArlSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').toUpperCase().trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.arl.create({ data: parsed.data });
  } catch (e) {
    return {
      error: e instanceof Error && e.message.includes('Unique') ? 'Código duplicado' : 'Error',
    };
  }

  revalidatePath('/admin/catalogos/arl');
  return { ok: true };
}

export async function toggleArlAction(id: string) {
  await requireAdmin();
  const a = await prisma.arl.findUnique({ where: { id } });
  if (!a) return;
  await prisma.arl.update({ where: { id }, data: { active: !a.active } });
  revalidatePath('/admin/catalogos/arl');
}

export async function importArlAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecciona un archivo' };
  }

  let rows: Record<string, unknown>[];
  try {
    rows = await parseExcelFile(file);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo leer el archivo' };
  }

  const result = newImportResult();
  result.total = rows.length;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const parsed = ArlSchema.safeParse({
      codigo: String(row.codigo ?? '').toUpperCase().trim(),
      nombre: String(row.nombre ?? '').trim(),
    });
    if (!parsed.success) {
      result.errors.push(`Fila ${i + 2}: ${parsed.error.issues[0]?.message ?? 'inválida'}`);
      result.skipped++;
      continue;
    }

    const existing = await prisma.arl.findUnique({ where: { codigo: parsed.data.codigo } });
    if (existing) {
      await prisma.arl.update({ where: { codigo: parsed.data.codigo }, data: parsed.data });
      result.updated++;
    } else {
      await prisma.arl.create({ data: parsed.data });
      result.added++;
    }
  }

  revalidatePath('/admin/catalogos/arl');
  return result;
}
