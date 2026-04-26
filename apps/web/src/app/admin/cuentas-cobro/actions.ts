'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { auditarCreate, auditarEvento } from '@/lib/auditoria';
import { CuentaCobroSchema } from '@/lib/validations';
import { titleCase } from '@/lib/text';
import { nextCuentaCobroCodigo } from '@/lib/consecutivo';

export type ActionState = { error?: string; ok?: boolean };

function parseForm(formData: FormData) {
  const g = (k: string) => String(formData.get(k) ?? '').trim();
  return {
    sucursalId: g('sucursalId'),
    razonSocial: titleCase(g('razonSocial')),
    nit: g('nit'),
    dv: g('dv'),
    tipoPersona: g('tipoPersona'),
    repLegalTipoDoc: g('repLegalTipoDoc'),
    repLegalNumeroDoc: g('repLegalNumeroDoc').toUpperCase(),
    repLegalNombre: titleCase(g('repLegalNombre')),
    direccion: titleCase(g('direccion')),
    ciudad: titleCase(g('ciudad')),
    departamento: titleCase(g('departamento')),
    telefono: g('telefono'),
    email: g('email').toLowerCase(),
  };
}

export async function createCuentaCobroAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const raw = parseForm(formData);

  // Scope: un SUCURSAL sólo puede crear cuentas en SU sucursal — ignoramos
  // lo que venga del form y forzamos su sucursalId. STAFF puede elegir.
  const scope = await getUserScope();
  if (!scope) return { error: 'Sesión inválida' };
  if (scope.tipo === 'SUCURSAL') raw.sucursalId = scope.sucursalId;

  // El código es consecutivo global (CCB-000001) — lo asigna el server.
  // Si por alguna race condition coincide, el @@unique reintenta.
  let attempt = 0;
  while (attempt < 3) {
    attempt += 1;
    const codigo = await nextCuentaCobroCodigo();
    const parsed = CuentaCobroSchema.safeParse({ ...raw, codigo });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    try {
      const creada = await prisma.cuentaCobro.create({ data: parsed.data });
      await auditarCreate({
        entidad: 'CuentaCobro',
        entidadId: creada.id,
        entidadSucursalId: creada.sucursalId,
        descripcion: `Cuenta de cobro creada: ${creada.codigo} · ${creada.razonSocial}`,
        despues: { ...parsed.data, id: creada.id, codigo: creada.codigo },
      });
      revalidatePath('/admin/cuentas-cobro');
      return { ok: true };
    } catch (e) {
      const isUnique = e instanceof Error && e.message.includes('Unique');
      if (isUnique && attempt < 3) continue; // reintenta con el siguiente consecutivo
      return {
        error: isUnique
          ? 'Conflicto de código, intente de nuevo'
          : 'Error al crear cuenta de cobro',
      };
    }
  }
  return { error: 'No se pudo asignar un código único, intente de nuevo' };
}

export async function toggleCuentaCobroAction(id: string) {
  await requireAuth();
  const c = await prisma.cuentaCobro.findUnique({ where: { id } });
  if (!c) return;

  // Scope: SUCURSAL sólo puede activar/desactivar sus propias cuentas.
  const scope = await getUserScope();
  if (!scope) return;
  if (scope.tipo === 'SUCURSAL' && c.sucursalId !== scope.sucursalId) return;

  const nuevoEstado = !c.active;
  await prisma.cuentaCobro.update({ where: { id }, data: { active: nuevoEstado } });

  await auditarEvento({
    entidad: 'CuentaCobro',
    entidadId: id,
    accion: 'TOGGLE',
    entidadSucursalId: c.sucursalId,
    descripcion: `Cuenta ${c.codigo} ${nuevoEstado ? 'activada' : 'desactivada'}`,
    cambios: {
      antes: { active: c.active },
      despues: { active: nuevoEstado },
      campos: ['active'],
    },
  });

  revalidatePath('/admin/cuentas-cobro');
}
