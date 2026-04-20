'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { ActividadSchema } from '@/lib/validations';
import { parseExcelFile, newImportResult } from '@/lib/excel';
import type { ImportState } from '../_components/import-form';

export type ActionState = { error?: string; ok?: boolean };

export async function createActividadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = ActividadSchema.safeParse({
    codigoCiiu: String(formData.get('codigoCiiu') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.actividadEconomica.create({ data: parsed.data });
  } catch (e) {
    return {
      error: e instanceof Error && e.message.includes('Unique') ? 'CIIU duplicado' : 'Error',
    };
  }

  revalidatePath('/admin/catalogos/actividades');
  return { ok: true };
}

export async function toggleActividadAction(id: string) {
  await requireAdmin();
  const a = await prisma.actividadEconomica.findUnique({ where: { id } });
  if (!a) return;
  await prisma.actividadEconomica.update({ where: { id }, data: { active: !a.active } });
  revalidatePath('/admin/catalogos/actividades');
}

export async function importActividadesAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Selecciona un archivo' };

  let rows: Record<string, unknown>[];
  try {
    rows = await parseExcelFile(file);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo leer' };
  }

  const result = newImportResult();
  result.total = rows.length;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const parsed = ActividadSchema.safeParse({
      codigoCiiu: String(row.codigoCiiu ?? row.codigo ?? '').trim(),
      descripcion: String(row.descripcion ?? row.nombre ?? '').trim(),
    });
    if (!parsed.success) {
      result.errors.push(`Fila ${i + 2}: ${parsed.error.issues[0]?.message ?? 'inválida'}`);
      result.skipped++;
      continue;
    }

    const existing = await prisma.actividadEconomica.findUnique({
      where: { codigoCiiu: parsed.data.codigoCiiu },
    });
    if (existing) {
      await prisma.actividadEconomica.update({
        where: { codigoCiiu: parsed.data.codigoCiiu },
        data: parsed.data,
      });
      result.updated++;
    } else {
      await prisma.actividadEconomica.create({ data: parsed.data });
      result.added++;
    }
  }

  revalidatePath('/admin/catalogos/actividades');
  return result;
}
