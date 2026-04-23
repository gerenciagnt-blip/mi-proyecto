'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import {
  getUserScope,
  validarSucursalIdAsignable,
} from '@/lib/sucursal-scope';
import { MedioPagoSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

/**
 * Resuelve el sucursalId del form:
 *   - STAFF: respeta el valor enviado (puede ser un id, o 'GLOBAL'=null)
 *   - ALIADO: ignora el form y fuerza su propia sucursal
 */
async function resolverSucursalId(rawValue: string): Promise<string | null> {
  const scope = await getUserScope();
  if (!scope) return null;
  if (scope.tipo === 'SUCURSAL') return scope.sucursalId;
  // STAFF: "GLOBAL" (o vacío) → null; cualquier otro string → id
  if (!rawValue || rawValue === 'GLOBAL') return null;
  return rawValue;
}

export async function createMedioPagoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const sucursalId = await resolverSucursalId(
    String(formData.get('sucursalId') ?? ''),
  );
  const err = await validarSucursalIdAsignable(sucursalId);
  if (err) return { error: err };

  const parsed = MedioPagoSchema.safeParse({
    codigo: String(formData.get('codigo') ?? '').toUpperCase().trim(),
    nombre: String(formData.get('nombre') ?? '').trim(),
    sucursalId,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.medioPago.create({
      data: {
        codigo: parsed.data.codigo,
        nombre: parsed.data.nombre,
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

  revalidatePath('/admin/catalogos/medios-pago');
  return { ok: true };
}

export async function toggleMedioPagoAction(id: string) {
  await requireAuth();
  const m = await prisma.medioPago.findUnique({ where: { id } });
  if (!m) return;

  // Validación de scope: un aliado no puede tocar recursos de otra sucursal
  const err = await validarSucursalIdAsignable(m.sucursalId);
  if (err) return;

  await prisma.medioPago.update({ where: { id }, data: { active: !m.active } });
  revalidatePath('/admin/catalogos/medios-pago');
}
