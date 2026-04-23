'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { TipoCotizanteSchema } from '@/lib/validations';
import { parseExcelFile, newImportResult } from '@/lib/excel';
import type { ImportState } from '../_components/import-form';

export type ActionState = { error?: string; ok?: boolean };

export async function createTipoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = TipoCotizanteSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    modalidad: String(formData.get('modalidad') ?? 'DEPENDIENTE'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.tipoCotizante.create({ data: parsed.data });
  } catch (e) {
    return {
      error: e instanceof Error && e.message.includes('Unique') ? 'Código duplicado' : 'Error',
    };
  }

  revalidatePath('/admin/catalogos/tipos-cotizante');
  return { ok: true };
}

export async function updateTipoModalidadAction(
  id: string,
  modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE',
) {
  await requireStaff();
  await prisma.tipoCotizante.update({ where: { id }, data: { modalidad } });
  revalidatePath('/admin/catalogos/tipos-cotizante');
}

export async function toggleTipoAction(id: string) {
  await requireStaff();
  const t = await prisma.tipoCotizante.findUnique({ where: { id } });
  if (!t) return;
  await prisma.tipoCotizante.update({ where: { id }, data: { active: !t.active } });
  revalidatePath('/admin/catalogos/tipos-cotizante');
}

export async function importTiposAction(
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
    const parsed = TipoCotizanteSchema.safeParse({
      codigo: String(row.codigo ?? '').trim(),
      nombre: String(row.nombre ?? '').trim(),
      modalidad: String(row.modalidad ?? 'DEPENDIENTE').toUpperCase(),
    });
    if (!parsed.success) {
      result.errors.push(`Fila ${i + 2}: ${parsed.error.issues[0]?.message ?? 'inválida'}`);
      result.skipped++;
      continue;
    }

    const existing = await prisma.tipoCotizante.findUnique({ where: { codigo: parsed.data.codigo } });
    if (existing) {
      await prisma.tipoCotizante.update({ where: { codigo: parsed.data.codigo }, data: parsed.data });
      result.updated++;
    } else {
      await prisma.tipoCotizante.create({ data: parsed.data });
      result.added++;
    }
  }

  revalidatePath('/admin/catalogos/tipos-cotizante');
  return result;
}
