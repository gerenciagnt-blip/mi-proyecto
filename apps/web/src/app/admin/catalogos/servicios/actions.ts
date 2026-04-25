'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getUserScope, validarSucursalIdAsignable } from '@/lib/sucursal-scope';
import { ServicioAdicionalSchema } from '@/lib/validations';
import { nextServicioAdicionalCodigo } from '@/lib/consecutivo';

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
  await requireAuth();

  const sucursalId = await resolverSucursalId(String(formData.get('sucursalId') ?? ''));
  const errSuc = await validarSucursalIdAsignable(sucursalId);
  if (errSuc) return { error: errSuc };

  const baseRaw = {
    nombre: String(formData.get('nombre') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim(),
    precio: String(formData.get('precio') ?? '0'),
    sucursalId,
  };

  // Código consecutivo global SRV-NNNN — lo asigna el server.
  let attempt = 0;
  while (attempt < 3) {
    attempt += 1;
    const codigo = await nextServicioAdicionalCodigo();
    const parsed = ServicioAdicionalSchema.safeParse({ ...baseRaw, codigo });
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
      revalidatePath('/admin/catalogos/servicios');
      return { ok: true };
    } catch (e) {
      const isUnique = e instanceof Error && e.message.includes('Unique');
      if (isUnique && attempt < 3) continue;
      return { error: isUnique ? 'Conflicto de código, intente de nuevo' : 'Error al crear' };
    }
  }
  return { error: 'No se pudo asignar un código único, intente de nuevo' };
}

export async function toggleServicioAction(id: string) {
  await requireAuth();
  const s = await prisma.servicioAdicional.findUnique({ where: { id } });
  if (!s) return;

  const err = await validarSucursalIdAsignable(s.sucursalId);
  if (err) return;

  await prisma.servicioAdicional.update({ where: { id }, data: { active: !s.active } });
  revalidatePath('/admin/catalogos/servicios');
}
