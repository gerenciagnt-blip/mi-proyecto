'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { CotizanteSchema, AfiliacionSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

function parseCotizante(fd: FormData) {
  const g = (k: string) => String(fd.get(k) ?? '').trim();
  const emptyNull = (v: string) => (v === '' ? null : v);
  return {
    tipoDocumento: g('tipoDocumento'),
    numeroDocumento: g('numeroDocumento'),
    fechaExpedicionDoc: emptyNull(g('fechaExpedicionDoc')),
    primerNombre: g('primerNombre'),
    segundoNombre: g('segundoNombre'),
    primerApellido: g('primerApellido'),
    segundoApellido: g('segundoApellido'),
    fechaNacimiento: g('fechaNacimiento'),
    genero: g('genero'),
    telefono: g('telefono'),
    celular: g('celular'),
    email: g('email'),
    direccion: g('direccion'),
    departamentoId: emptyNull(g('departamentoId')),
    municipioId: emptyNull(g('municipioId')),
  };
}

function parseAfiliacion(fd: FormData) {
  const g = (k: string) => String(fd.get(k) ?? '').trim();
  return {
    empresaId: g('empresaId'),
    cuentaCobroId: g('cuentaCobroId'),
    asesorComercialId: g('asesorComercialId'),
    tipoCotizanteId: g('tipoCotizanteId'),
    subtipoId: g('subtipoId'),
    nivelRiesgo: g('nivelRiesgo'),
    salario: g('salario'),
    fechaIngreso: g('fechaIngreso'),
  };
}

export async function createAfiliacionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const cotParsed = CotizanteSchema.safeParse(parseCotizante(formData));
  if (!cotParsed.success) {
    return { error: `Cotizante: ${cotParsed.error.issues[0]?.message ?? 'inválido'}` };
  }

  const afParsed = AfiliacionSchema.safeParse(parseAfiliacion(formData));
  if (!afParsed.success) {
    return { error: `Afiliación: ${afParsed.error.issues[0]?.message ?? 'inválida'}` };
  }

  // Validación cruzada contra los "permitidos" de la empresa
  const empresa = await prisma.empresa.findUnique({
    where: { id: afParsed.data.empresaId },
    include: {
      nivelesPermitidos: { select: { nivel: true } },
      tiposPermitidos: { select: { tipoCotizanteId: true } },
      subtiposPermitidos: { select: { subtipoId: true } },
    },
  });
  if (!empresa) return { error: 'Empresa no existe' };

  const nivelesOK = new Set(empresa.nivelesPermitidos.map((n) => n.nivel));
  const tiposOK = new Set(empresa.tiposPermitidos.map((t) => t.tipoCotizanteId));
  const subtiposOK = new Set(empresa.subtiposPermitidos.map((s) => s.subtipoId));

  // Solo aplica si la empresa declaró permitidos; si está vacía, no restringimos.
  if (nivelesOK.size > 0 && !nivelesOK.has(afParsed.data.nivelRiesgo)) {
    return { error: `El nivel ${afParsed.data.nivelRiesgo} no está permitido en esta empresa` };
  }
  if (tiposOK.size > 0 && !tiposOK.has(afParsed.data.tipoCotizanteId)) {
    return { error: 'El tipo de cotizante no está permitido en esta empresa' };
  }
  if (
    afParsed.data.subtipoId &&
    subtiposOK.size > 0 &&
    !subtiposOK.has(afParsed.data.subtipoId)
  ) {
    return { error: 'El subtipo no está permitido en esta empresa' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Upsert cotizante por (tipoDoc, numeroDoc) — si ya existe, actualizar datos
      const cotizante = await tx.cotizante.upsert({
        where: {
          tipoDocumento_numeroDocumento: {
            tipoDocumento: cotParsed.data.tipoDocumento,
            numeroDocumento: cotParsed.data.numeroDocumento,
          },
        },
        create: cotParsed.data,
        update: cotParsed.data,
      });

      await tx.afiliacion.create({
        data: {
          cotizanteId: cotizante.id,
          empresaId: afParsed.data.empresaId,
          cuentaCobroId: afParsed.data.cuentaCobroId,
          asesorComercialId: afParsed.data.asesorComercialId,
          tipoCotizanteId: afParsed.data.tipoCotizanteId,
          subtipoId: afParsed.data.subtipoId,
          nivelRiesgo: afParsed.data.nivelRiesgo,
          salario: afParsed.data.salario,
          fechaIngreso: afParsed.data.fechaIngreso,
        },
      });
    });
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes('Unique')
          ? 'Ya existe una afiliación con estos datos'
          : 'Error al guardar',
    };
  }

  revalidatePath('/admin/base-datos');
  redirect('/admin/base-datos');
}
