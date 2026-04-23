'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { SubtipoSchema } from '@/lib/validations';
import { parseExcelFile, newImportResult } from '@/lib/excel';
import type { ImportState } from '../../_components/import-form';

export type ActionState = { error?: string; ok?: boolean };

export async function createSubtipoAction(
  tipoCotizanteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = SubtipoSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.subtipo.create({
      data: { ...parsed.data, tipoCotizanteId },
    });
  } catch (e) {
    return {
      error: e instanceof Error && e.message.includes('Unique') ? 'Código duplicado' : 'Error',
    };
  }

  revalidatePath(`/admin/catalogos/tipos-cotizante/${tipoCotizanteId}`);
  return { ok: true };
}

export async function toggleSubtipoAction(tipoCotizanteId: string, id: string) {
  await requireStaff();
  const s = await prisma.subtipo.findUnique({ where: { id } });
  if (!s) return;
  await prisma.subtipo.update({ where: { id }, data: { active: !s.active } });
  revalidatePath(`/admin/catalogos/tipos-cotizante/${tipoCotizanteId}`);
}

export async function importSubtiposAction(
  tipoCotizanteId: string,
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireStaff();

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
    const parsed = SubtipoSchema.safeParse({
      codigo: String(row.codigo ?? '').trim(),
      nombre: String(row.nombre ?? '').trim(),
    });
    if (!parsed.success) {
      result.errors.push(`Fila ${i + 2}: ${parsed.error.issues[0]?.message ?? 'inválida'}`);
      result.skipped++;
      continue;
    }

    const existing = await prisma.subtipo.findUnique({
      where: { codigo_tipoCotizanteId: { codigo: parsed.data.codigo, tipoCotizanteId } },
    });
    if (existing) {
      await prisma.subtipo.update({
        where: { id: existing.id },
        data: parsed.data,
      });
      result.updated++;
    } else {
      await prisma.subtipo.create({ data: { ...parsed.data, tipoCotizanteId } });
      result.added++;
    }
  }

  revalidatePath(`/admin/catalogos/tipos-cotizante/${tipoCotizanteId}`);
  return result;
}
