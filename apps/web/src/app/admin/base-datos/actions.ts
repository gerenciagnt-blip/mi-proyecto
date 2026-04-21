'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { CotizanteSchema, AfiliacionSchema } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean; cotizanteId?: string };

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
    planSgssId: g('planSgssId'),
    actividadEconomicaId: g('actividadEconomicaId'),
    tipoCotizanteId: g('tipoCotizanteId'),
    subtipoId: g('subtipoId'),
    nivelRiesgo: g('nivelRiesgo'),
    regimen: g('regimen') || 'ORDINARIO',
    estado: g('estado') || 'ACTIVA',
    salario: g('salario'),
    valorAdministracion: g('valorAdministracion'),
    fechaIngreso: g('fechaIngreso'),
    comentarios: g('comentarios'),
    epsId: g('epsId'),
    afpId: g('afpId'),
    ccfId: g('ccfId'),
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

  // Salario >= SMLV
  const smlv = await prisma.smlvConfig.findUnique({ where: { id: 'singleton' } });
  if (smlv && afParsed.data.salario < Number(smlv.valor)) {
    return {
      error: `Salario (${afParsed.data.salario}) debe ser mayor o igual al SMLV (${Number(smlv.valor)})`,
    };
  }

  // Validación cruzada con los permitidos de la empresa
  const empresa = await prisma.empresa.findUnique({
    where: { id: afParsed.data.empresaId },
    include: {
      nivelesPermitidos: { select: { nivel: true } },
      tiposPermitidos: { select: { tipoCotizanteId: true } },
      subtiposPermitidos: { select: { subtipoId: true } },
      actividadesPermitidas: { select: { actividadEconomicaId: true } },
    },
  });
  if (!empresa) return { error: 'Empresa no existe' };

  const nivelesOK = new Set(empresa.nivelesPermitidos.map((n) => n.nivel));
  const tiposOK = new Set(empresa.tiposPermitidos.map((t) => t.tipoCotizanteId));
  const subtiposOK = new Set(empresa.subtiposPermitidos.map((s) => s.subtipoId));
  const actividadesOK = new Set(
    empresa.actividadesPermitidas.map((a) => a.actividadEconomicaId),
  );

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

  // Validación: actividad económica debe estar en las permitidas de la empresa
  // (o ser la actividad principal de la empresa, via codigoCiiu)
  if (afParsed.data.actividadEconomicaId) {
    const actId = afParsed.data.actividadEconomicaId;
    const actPrincipalMatch = empresa.ciiuPrincipal
      ? await prisma.actividadEconomica.findFirst({
          where: { id: actId, codigoCiiu: empresa.ciiuPrincipal },
          select: { id: true },
        })
      : null;
    if (!actPrincipalMatch && actividadesOK.size > 0 && !actividadesOK.has(actId)) {
      return {
        error: 'La actividad económica no está permitida en esta empresa',
      };
    }
  }

  // Validación: plan SGSS requiere las entidades indicadas
  if (afParsed.data.planSgssId) {
    const plan = await prisma.planSgss.findUnique({
      where: { id: afParsed.data.planSgssId },
    });
    if (plan) {
      if (plan.incluyeEps && !afParsed.data.epsId) {
        return { error: `El plan "${plan.nombre}" requiere EPS` };
      }
      if (plan.incluyeAfp && !afParsed.data.afpId) {
        return { error: `El plan "${plan.nombre}" requiere AFP` };
      }
      if (plan.incluyeCcf && !afParsed.data.ccfId) {
        return { error: `El plan "${plan.nombre}" requiere Caja de Compensación` };
      }
      // ARL viene de la empresa (empresa.arlId); se valida en la empresa, no en afiliación
    }
  }

  // Servicios adicionales (array de IDs del form)
  const serviciosIds = formData.getAll('servicioId').map(String).filter(Boolean);

  try {
    await prisma.$transaction(async (tx) => {
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

      const af = await tx.afiliacion.create({
        data: {
          cotizanteId: cotizante.id,
          empresaId: afParsed.data.empresaId,
          cuentaCobroId: afParsed.data.cuentaCobroId,
          asesorComercialId: afParsed.data.asesorComercialId,
          planSgssId: afParsed.data.planSgssId,
          actividadEconomicaId: afParsed.data.actividadEconomicaId,
          tipoCotizanteId: afParsed.data.tipoCotizanteId,
          subtipoId: afParsed.data.subtipoId,
          nivelRiesgo: afParsed.data.nivelRiesgo,
          regimen: afParsed.data.regimen,
          estado: afParsed.data.estado,
          salario: afParsed.data.salario,
          valorAdministracion: afParsed.data.valorAdministracion,
          fechaIngreso: afParsed.data.fechaIngreso,
          comentarios: afParsed.data.comentarios,
          epsId: afParsed.data.epsId,
          afpId: afParsed.data.afpId,
          ccfId: afParsed.data.ccfId,
        },
      });

      if (serviciosIds.length > 0) {
        await tx.afiliacionServicio.createMany({
          data: serviciosIds.map((sId) => ({ afiliacionId: af.id, servicioAdicionalId: sId })),
          skipDuplicates: true,
        });
      }
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
  return { ok: true };
}
