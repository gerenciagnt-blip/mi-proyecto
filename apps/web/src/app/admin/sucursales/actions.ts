'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { auditarCreate, auditarUpdate, auditarEvento } from '@/lib/auditoria';
import { SucursalCreateSchema, SucursalUpdateSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

export async function createSucursalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = SucursalCreateSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '')
      .toUpperCase()
      .trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  let creada;
  try {
    creada = await prisma.sucursal.create({ data: parsed.data });
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes('Unique')
        ? 'Ya existe una sucursal con ese código'
        : 'Error al crear sucursal';
    return { error: msg };
  }

  // La sucursal recién creada YA es su propio entidadSucursalId — el aliado
  // que arranque ahí va a ver este evento de bienvenida en su bitácora.
  await auditarCreate({
    entidad: 'Sucursal',
    entidadId: creada.id,
    entidadSucursalId: creada.id,
    descripcion: `Sucursal creada: ${creada.codigo} · ${creada.nombre}`,
    despues: { codigo: creada.codigo, nombre: creada.nombre },
  });

  revalidatePath('/admin/sucursales');
  return { ok: true };
}

export async function updateSucursalAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = SucursalUpdateSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '')
      .toUpperCase()
      .trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    active: formData.get('active') === 'on',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const antes = await prisma.sucursal.findUnique({
    where: { id },
    select: { codigo: true, nombre: true, active: true },
  });
  if (!antes) return { error: 'Sucursal no encontrada' };

  try {
    await prisma.sucursal.update({ where: { id }, data: parsed.data });
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes('Unique')
        ? 'Código duplicado'
        : 'Error al actualizar';
    return { error: msg };
  }

  await auditarUpdate({
    entidad: 'Sucursal',
    entidadId: id,
    entidadSucursalId: id,
    antes,
    despues: parsed.data,
  });

  revalidatePath('/admin/sucursales');
  redirect('/admin/sucursales');
}

export async function toggleSucursalAction(id: string) {
  await requireAdmin();
  const s = await prisma.sucursal.findUnique({ where: { id } });
  if (!s) return;
  const nuevoEstado = !s.active;
  await prisma.sucursal.update({ where: { id }, data: { active: nuevoEstado } });

  await auditarEvento({
    entidad: 'Sucursal',
    entidadId: id,
    accion: 'TOGGLE',
    entidadSucursalId: id,
    descripcion: `Sucursal ${s.codigo} ${nuevoEstado ? 'activada' : 'desactivada'}`,
    cambios: {
      antes: { active: s.active },
      despues: { active: nuevoEstado },
      campos: ['active'],
    },
  });

  revalidatePath('/admin/sucursales');
}

export async function toggleBloqueoMoraAction(id: string) {
  await requireAdmin();
  const s = await prisma.sucursal.findUnique({ where: { id } });
  if (!s) return;
  const nuevoBloqueo = !s.bloqueadaPorMora;
  await prisma.sucursal.update({
    where: { id },
    data: { bloqueadaPorMora: nuevoBloqueo },
  });

  // Este evento es CRÍTICO: bloquea/desbloquea las operaciones del aliado.
  await auditarEvento({
    entidad: 'Sucursal',
    entidadId: id,
    accion: 'BLOQUEO_MORA',
    entidadSucursalId: id,
    descripcion: `Sucursal ${s.codigo} ${nuevoBloqueo ? 'BLOQUEADA por mora' : 'DESBLOQUEADA'}`,
    cambios: {
      antes: { bloqueadaPorMora: s.bloqueadaPorMora },
      despues: { bloqueadaPorMora: nuevoBloqueo },
      campos: ['bloqueadaPorMora'],
    },
  });

  revalidatePath('/admin/sucursales');
}
