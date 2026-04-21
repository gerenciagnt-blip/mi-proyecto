'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { CuentaCobroSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

function parseForm(formData: FormData) {
  const g = (k: string) => String(formData.get(k) ?? '').trim();
  return {
    sucursalId: g('sucursalId'),
    codigo: g('codigo').toUpperCase(),
    razonSocial: g('razonSocial'),
    nit: g('nit'),
    dv: g('dv'),
    tipoPersona: g('tipoPersona'),
    repLegalTipoDoc: g('repLegalTipoDoc'),
    repLegalNumeroDoc: g('repLegalNumeroDoc'),
    repLegalNombre: g('repLegalNombre'),
    direccion: g('direccion'),
    ciudad: g('ciudad'),
    departamento: g('departamento'),
    telefono: g('telefono'),
    email: g('email'),
  };
}

export async function createCuentaCobroAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = CuentaCobroSchema.safeParse(parseForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    await prisma.cuentaCobro.create({ data: parsed.data });
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes('Unique')
          ? 'Ya existe una cuenta con ese código en esa sucursal'
          : 'Error al crear cuenta de cobro',
    };
  }

  revalidatePath('/admin/cuentas-cobro');
  return { ok: true };
}

export async function toggleCuentaCobroAction(id: string) {
  await requireAdmin();
  const c = await prisma.cuentaCobro.findUnique({ where: { id } });
  if (!c) return;
  await prisma.cuentaCobro.update({ where: { id }, data: { active: !c.active } });
  revalidatePath('/admin/cuentas-cobro');
}
