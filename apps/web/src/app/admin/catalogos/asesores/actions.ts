'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import {
  getUserScope,
  validarSucursalIdAsignable,
} from '@/lib/sucursal-scope';
import { AsesorSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

async function resolverSucursalId(rawValue: string): Promise<string | null> {
  const scope = await getUserScope();
  if (!scope) return null;
  if (scope.tipo === 'SUCURSAL') return scope.sucursalId;
  if (!rawValue || rawValue === 'GLOBAL') return null;
  return rawValue;
}

export async function createAsesorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const sucursalId = await resolverSucursalId(
    String(formData.get('sucursalId') ?? ''),
  );
  const errSuc = await validarSucursalIdAsignable(sucursalId);
  if (errSuc) return { error: errSuc };

  const parsed = AsesorSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').toUpperCase().trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    telefono: String(formData.get('telefono') ?? '').trim(),
    sucursalId,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.asesorComercial.create({
      data: {
        codigo: parsed.data.codigo,
        nombre: parsed.data.nombre,
        email: parsed.data.email,
        telefono: parsed.data.telefono,
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

  revalidatePath('/admin/catalogos/asesores');
  return { ok: true };
}

export async function toggleAsesorAction(id: string) {
  await requireAuth();
  const a = await prisma.asesorComercial.findUnique({ where: { id } });
  if (!a) return;

  const err = await validarSucursalIdAsignable(a.sucursalId);
  if (err) return;

  await prisma.asesorComercial.update({ where: { id }, data: { active: !a.active } });
  revalidatePath('/admin/catalogos/asesores');
}
