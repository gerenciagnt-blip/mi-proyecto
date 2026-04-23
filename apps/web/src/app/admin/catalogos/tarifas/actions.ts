'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { TarifaSgssSchema, FspRangoSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

function parseTarifa(fd: FormData) {
  const g = (k: string) => String(fd.get(k) ?? '').trim();
  return {
    concepto: g('concepto'),
    modalidad: g('modalidad'),
    nivelRiesgo: g('nivelRiesgo'),
    exonera: g('exonera'),
    porcentaje: g('porcentaje'),
    etiqueta: g('etiqueta'),
    observaciones: g('observaciones'),
  };
}

// ============ Tarifa SGSS ============

export async function createTarifaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = TarifaSgssSchema.safeParse(parseTarifa(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.tarifaSgss.create({ data: parsed.data });
  } catch {
    return { error: 'Error al crear tarifa' };
  }

  revalidatePath('/admin/catalogos/tarifas');
  return { ok: true };
}

export async function updateTarifaAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = TarifaSgssSchema.safeParse(parseTarifa(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.tarifaSgss.update({ where: { id }, data: parsed.data });
  } catch {
    return { error: 'Error al actualizar tarifa' };
  }

  revalidatePath('/admin/catalogos/tarifas');
  return { ok: true };
}

export async function toggleTarifaAction(id: string) {
  await requireStaff();
  const t = await prisma.tarifaSgss.findUnique({ where: { id } });
  if (!t) return;
  await prisma.tarifaSgss.update({ where: { id }, data: { active: !t.active } });
  revalidatePath('/admin/catalogos/tarifas');
}

export async function deleteTarifaAction(id: string) {
  await requireStaff();
  await prisma.tarifaSgss.delete({ where: { id } });
  revalidatePath('/admin/catalogos/tarifas');
}

// ============ FSP ============

function parseFsp(fd: FormData) {
  const g = (k: string) => String(fd.get(k) ?? '').trim();
  return {
    smlvDesde: g('smlvDesde'),
    smlvHasta: g('smlvHasta'),
    porcentaje: g('porcentaje'),
  };
}

export async function createFspAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = FspRangoSchema.safeParse(parseFsp(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.fspRango.create({ data: parsed.data });
  } catch {
    return { error: 'Error al crear rango FSP' };
  }

  revalidatePath('/admin/catalogos/tarifas');
  return { ok: true };
}

export async function updateFspAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = FspRangoSchema.safeParse(parseFsp(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.fspRango.update({ where: { id }, data: parsed.data });
  } catch {
    return { error: 'Error al actualizar rango FSP' };
  }

  revalidatePath('/admin/catalogos/tarifas');
  return { ok: true };
}

export async function toggleFspAction(id: string) {
  await requireStaff();
  const r = await prisma.fspRango.findUnique({ where: { id } });
  if (!r) return;
  await prisma.fspRango.update({ where: { id }, data: { active: !r.active } });
  revalidatePath('/admin/catalogos/tarifas');
}

export async function deleteFspAction(id: string) {
  await requireStaff();
  await prisma.fspRango.delete({ where: { id } });
  revalidatePath('/admin/catalogos/tarifas');
}
