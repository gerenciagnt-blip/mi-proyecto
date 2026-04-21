'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { EmpresaCreateSchema, EmpresaUpdateSchema } from '@/lib/validations';
import { titleCase } from '@/lib/text';

export type ActionState = { error?: string; ok?: boolean };

function parseForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return v == null ? '' : String(v).trim();
  };
  return {
    nit: get('nit'),
    dv: get('dv'),
    nombre: titleCase(get('nombre')),
    nombreComercial: titleCase(get('nombreComercial')),
    tipoPersona: get('tipoPersona'),
    repLegalTipoDoc: get('repLegalTipoDoc'),
    repLegalNumeroDoc: get('repLegalNumeroDoc').toUpperCase(),
    repLegalNombre: titleCase(get('repLegalNombre')),
    direccion: titleCase(get('direccion')),
    ciudad: titleCase(get('ciudad')),
    departamento: titleCase(get('departamento')),
    departamentoId: get('departamentoId'),
    municipioId: get('municipioId'),
    telefono: get('telefono'),
    email: get('email').toLowerCase(),
    ciiuPrincipal: get('ciiuPrincipal'),
    arlId: get('arlId'),
    exoneraLey1607: formData.get('exoneraLey1607') === 'on',
  };
}

export async function createEmpresaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = EmpresaCreateSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  try {
    await prisma.empresa.create({ data: parsed.data });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('Unique')
      ? 'Ya existe una empresa con ese NIT'
      : 'Error al crear empresa';
    return { error: msg };
  }

  revalidatePath('/admin/empresas');
  return { ok: true };
}

export async function updateEmpresaAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = EmpresaUpdateSchema.safeParse({
    ...parseForm(formData),
    active: formData.get('active') === 'on',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  try {
    await prisma.empresa.update({ where: { id }, data: parsed.data });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('Unique')
      ? 'NIT duplicado'
      : 'Error al actualizar';
    return { error: msg };
  }

  revalidatePath('/admin/empresas');
  redirect('/admin/empresas');
}

export async function toggleEmpresaAction(id: string) {
  await requireAdmin();
  const e = await prisma.empresa.findUnique({ where: { id } });
  if (!e) return;
  await prisma.empresa.update({ where: { id }, data: { active: !e.active } });
  revalidatePath('/admin/empresas');
}
