'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import {
  getUserScope,
  validarSucursalIdAsignable,
} from '@/lib/sucursal-scope';
import { ServicioAdicionalSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

async function resolverSucursalId(rawValue: string): Promise<string | null> {
  const scope = await getUserScope();
  if (!scope) return null;
  if (scope.tipo === 'SUCURSAL') return scope.sucursalId;
  if (!rawValue || rawValue === 'GLOBAL') return null;
  return rawValue;
}

export async function createServicioAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const sucursalId = await resolverSucursalId(
    String(formData.get('sucursalId') ?? ''),
  );
  const errSuc = await validarSucursalIdAsignable(sucursalId);
  if (errSuc) return { error: errSuc };

  const parsed = ServicioAdicionalSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').toUpperCase().trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim(),
    precio: String(formData.get('precio') ?? '0'),
    sucursalId,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.servicioAdicional.create({
      data: {
        codigo: parsed.data.codigo,
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion,
        precio: parsed.data.precio,
        sucursalId: parsed.data.sucursalId ?? null,
      },
    });
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes('Unique')
          ? 'Código duplicado en la sucursal'
          : 'Error al crear',
    };
  }

  revalidatePath('/admin/catalogos/servicios');
  return { ok: true };
}

export async function toggleServicioAction(id: string) {
  await requireAdmin();
  const s = await prisma.servicioAdicional.findUnique({ where: { id } });
  if (!s) return;

  const err = await validarSucursalIdAsignable(s.sucursalId);
  if (err) return;

  await prisma.servicioAdicional.update({ where: { id }, data: { active: !s.active } });
  revalidatePath('/admin/catalogos/servicios');
}
