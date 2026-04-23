'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { CotizanteSchema, AfiliacionSchema } from '@/lib/validations';
import { titleCase, sentenceCase } from '@/lib/text';

export type ActionState = { error?: string; ok?: boolean };

// ============ Parsers ============

function parseCotizante(fd: FormData) {
  const g = (k: string) => String(fd.get(k) ?? '').trim();
  const emptyNull = (v: string) => (v === '' ? null : v);
  // El documento va en MAYÚSCULAS (cédula letras para PAS); el email en minúsculas.
  return {
    tipoDocumento: g('tipoDocumento'),
    numeroDocumento: g('numeroDocumento').toUpperCase(),
    fechaExpedicionDoc: emptyNull(g('fechaExpedicionDoc')),
    primerNombre: titleCase(g('primerNombre')),
    segundoNombre: titleCase(g('segundoNombre')),
    primerApellido: titleCase(g('primerApellido')),
    segundoApellido: titleCase(g('segundoApellido')),
    fechaNacimiento: g('fechaNacimiento'),
    genero: g('genero'),
    telefono: g('telefono'),
    celular: g('celular'),
    email: g('email').toLowerCase(),
    direccion: titleCase(g('direccion')),
    departamentoId: emptyNull(g('departamentoId')),
    municipioId: emptyNull(g('municipioId')),
  };
}

function parseAfiliacion(fd: FormData) {
  const g = (k: string) => String(fd.get(k) ?? '').trim();
  return {
    modalidad: g('modalidad') || 'DEPENDIENTE',
    empresaId: g('empresaId'),
    cuentaCobroId: g('cuentaCobroId'),
    asesorComercialId: g('asesorComercialId'),
    planSgssId: g('planSgssId'),
    actividadEconomicaId: g('actividadEconomicaId'),
    tipoCotizanteId: g('tipoCotizanteId'),
    subtipoId: g('subtipoId'),
    nivelRiesgo: g('nivelRiesgo'),
    regimen: g('regimen'),
    formaPago: g('formaPago'),
    estado: g('estado') || 'ACTIVA',
    salario: g('salario'),
    valorAdministracion: g('valorAdministracion'),
    fechaIngreso: g('fechaIngreso'),
    comentarios: sentenceCase(g('comentarios')),
    epsId: g('epsId'),
    afpId: g('afpId'),
    arlId: g('arlId'),
    ccfId: g('ccfId'),
  };
}

// ============ Validación cruzada ============

type AfiliacionPayload = {
  modalidad: string;
  empresaId: string | null;
  nivelRiesgo: string;
  tipoCotizanteId: string;
  subtipoId: string | null;
  actividadEconomicaId: string | null;
  planSgssId: string | null;
  regimen: string | null;
  epsId: string | null;
  afpId: string | null;
  arlId: string | null;
  ccfId: string | null;
  salario: number;
};

type PlanConFlags = {
  id: string;
  nombre: string;
  incluyeEps: boolean;
  incluyeAfp: boolean;
  incluyeArl: boolean;
  incluyeCcf: boolean;
  regimen: 'ORDINARIO' | 'RESOLUCION' | 'AMBOS';
};

/**
 * Prepara el payload: carga el plan SGSS (si hay) y LIMPIA los IDs de
 * entidades que no aplican a ese plan.
 *
 * Ejemplo: plan sin AFP + usuario mandó `afpId = "abc"` → lo forzamos a
 * null antes de guardar. Esto evita datos colgados en BD cuando el form
 * oculta un campo pero el valor ya estaba seteado en una edición previa.
 */
async function prepararPayload(
  data: AfiliacionPayload,
): Promise<{ normalized: AfiliacionPayload; plan: PlanConFlags | null }> {
  let plan: PlanConFlags | null = null;
  if (data.planSgssId) {
    plan = await prisma.planSgss.findUnique({
      where: { id: data.planSgssId },
      select: {
        id: true,
        nombre: true,
        incluyeEps: true,
        incluyeAfp: true,
        incluyeArl: true,
        incluyeCcf: true,
        regimen: true,
      },
    });
  }

  const normalized: AfiliacionPayload = { ...data };
  if (plan) {
    if (!plan.incluyeEps) normalized.epsId = null;
    if (!plan.incluyeAfp) normalized.afpId = null;
    if (!plan.incluyeArl) normalized.arlId = null;
    if (!plan.incluyeCcf) normalized.ccfId = null;
  }
  return { normalized, plan };
}

async function validateAfiliacion(
  data: AfiliacionPayload,
  plan: PlanConFlags | null,
): Promise<string | null> {
  const smlv = await prisma.smlvConfig.findUnique({ where: { id: 'singleton' } });
  if (smlv && data.salario < Number(smlv.valor)) {
    return `Salario (${data.salario}) debe ser mayor o igual al SMLV (${Number(smlv.valor)})`;
  }

  // El tipo de cotizante debe coincidir con la modalidad elegida.
  const tipo = await prisma.tipoCotizante.findUnique({
    where: { id: data.tipoCotizanteId },
    select: { codigo: true, modalidad: true, nombre: true },
  });
  if (!tipo) return 'Tipo de cotizante no existe';
  if (tipo.modalidad !== data.modalidad) {
    return `El tipo "${tipo.nombre}" no corresponde a la modalidad ${data.modalidad.toLowerCase()}`;
  }

  // Rama DEPENDIENTE — empresa obligatoria y aplica toda la validación cruzada
  if (data.modalidad === 'DEPENDIENTE') {
    if (!data.empresaId) return 'Empresa planilla requerida para dependientes';
    const empresa = await prisma.empresa.findUnique({
      where: { id: data.empresaId },
      include: {
        nivelesPermitidos: { select: { nivel: true } },
        tiposPermitidos: { select: { tipoCotizanteId: true } },
        subtiposPermitidos: { select: { subtipoId: true } },
        actividadesPermitidas: { select: { actividadEconomicaId: true } },
      },
    });
    if (!empresa) return 'Empresa no existe';

    const nivelesOK = new Set(empresa.nivelesPermitidos.map((n) => n.nivel));
    const tiposOK = new Set(empresa.tiposPermitidos.map((t) => t.tipoCotizanteId));
    const subtiposOK = new Set(empresa.subtiposPermitidos.map((s) => s.subtipoId));
    const actividadesOK = new Set(
      empresa.actividadesPermitidas.map((a) => a.actividadEconomicaId),
    );

    if (nivelesOK.size > 0 && !nivelesOK.has(data.nivelRiesgo as never)) {
      return `El nivel ${data.nivelRiesgo} no está permitido en esta empresa`;
    }
    if (tiposOK.size > 0 && !tiposOK.has(data.tipoCotizanteId)) {
      return 'El tipo de cotizante no está permitido en esta empresa';
    }
    if (data.subtipoId && subtiposOK.size > 0 && !subtiposOK.has(data.subtipoId)) {
      return 'El subtipo no está permitido en esta empresa';
    }
    if (data.actividadEconomicaId) {
      const actId = data.actividadEconomicaId;
      const actPrincipalMatch = empresa.ciiuPrincipal
        ? await prisma.actividadEconomica.findFirst({
            where: { id: actId, codigoCiiu: empresa.ciiuPrincipal },
            select: { id: true },
          })
        : null;
      if (!actPrincipalMatch && actividadesOK.size > 0 && !actividadesOK.has(actId)) {
        return 'La actividad económica no está permitida en esta empresa';
      }
    }
  }

  // Plan SGSS — aplica a ambas modalidades.
  if (plan) {
    // (2) Validar compatibilidad de régimen: si el plan NO es AMBOS, el
    // régimen de la afiliación debe coincidir. Para INDEPENDIENTES sin
    // campo régimen (= null) se asume ORDINARIO por default.
    if (plan.regimen !== 'AMBOS') {
      const regimenAf = data.regimen ?? 'ORDINARIO';
      if (plan.regimen !== regimenAf) {
        return `El plan "${plan.nombre}" solo aplica al régimen ${plan.regimen.toLowerCase()}`;
      }
    }

    // (4) Restricciones para plan de Resolución EPS+ARL: el generador del
    // archivo plano espera tipo cotizante 01 y subtipo 04 fijos. Hay que
    // validar aquí para que el dato guardado sea coherente con la salida.
    const esResolucionEpsArl =
      plan.regimen === 'RESOLUCION' &&
      plan.incluyeEps &&
      plan.incluyeArl &&
      !plan.incluyeAfp &&
      !plan.incluyeCcf;
    if (esResolucionEpsArl) {
      if (tipo.codigo !== '01') {
        return `El plan "${plan.nombre}" (Resolución EPS+ARL) requiere tipo cotizante 01 (Dependiente). Actual: ${tipo.codigo}`;
      }
      const sub = data.subtipoId
        ? await prisma.subtipo.findUnique({
            where: { id: data.subtipoId },
            select: { codigo: true },
          })
        : null;
      if (!sub || sub.codigo !== '04') {
        return `El plan "${plan.nombre}" (Resolución EPS+ARL) requiere subtipo 04`;
      }
    }

    // Entidades requeridas según el plan.
    if (plan.incluyeEps && !data.epsId) return `El plan "${plan.nombre}" requiere EPS`;
    if (plan.incluyeAfp && !data.afpId) return `El plan "${plan.nombre}" requiere AFP`;
    if (plan.incluyeCcf && !data.ccfId)
      return `El plan "${plan.nombre}" requiere Caja de Compensación`;
    if (plan.incluyeArl && data.modalidad === 'INDEPENDIENTE' && !data.arlId) {
      return `El plan "${plan.nombre}" requiere ARL`;
    }
  }
  return null;
}

// ============ Audit log helper ============

async function currentUser() {
  const { auth } = await import('@/auth');
  const session = await auth();
  return session?.user
    ? { id: session.user.id, name: session.user.name }
    : { id: null, name: null };
}

async function logAudit(params: {
  entidad: string;
  entidadId: string;
  accion: string;
  descripcion?: string;
  cambios?: unknown;
}) {
  const u = await currentUser();
  await prisma.auditLog.create({
    data: {
      entidad: params.entidad,
      entidadId: params.entidadId,
      accion: params.accion,
      userId: u.id,
      userName: u.name,
      descripcion: params.descripcion,
      cambios: params.cambios as Prisma.InputJsonValue | undefined,
    },
  });
}

// ============ CREATE ============

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

  // (3) Cascada: limpiar IDs de entidades que no aplican al plan
  const { normalized, plan } = await prepararPayload(afParsed.data);

  // (2)(4) Validaciones: régimen, restricciones por plan, empresa cruzada
  const validationError = await validateAfiliacion(normalized, plan);
  if (validationError) return { error: validationError };

  // ----- Scope: resolver sucursalId del cotizante -----
  // SUCURSAL (aliado): se toma automáticamente del scope.
  // STAFF (ADMIN/SOPORTE): se hereda de la cuenta de cobro elegida
  //   (siempre tiene sucursalId NOT NULL). Si no hay cuenta de cobro
  //   en el form, se deja null (legado — staff puede reasignar luego).
  const scope = await getUserScope();
  if (!scope) return { error: 'Sesión inválida' };

  let sucursalIdCotizante: string | null;
  if (scope.tipo === 'SUCURSAL') {
    sucursalIdCotizante = scope.sucursalId;
    // Validar que la cuenta de cobro elegida (si la hay) pertenece a mi sucursal.
    if (afParsed.data.cuentaCobroId) {
      const cc = await prisma.cuentaCobro.findUnique({
        where: { id: afParsed.data.cuentaCobroId },
        select: { sucursalId: true },
      });
      if (!cc || cc.sucursalId !== scope.sucursalId) {
        return { error: 'La cuenta de cobro no pertenece a tu sucursal' };
      }
    }
  } else {
    // STAFF — heredar de la cuenta de cobro si hay.
    if (afParsed.data.cuentaCobroId) {
      const cc = await prisma.cuentaCobro.findUnique({
        where: { id: afParsed.data.cuentaCobroId },
        select: { sucursalId: true },
      });
      sucursalIdCotizante = cc?.sucursalId ?? null;
    } else {
      sucursalIdCotizante = null;
    }
  }

  const serviciosIds = formData.getAll('servicioId').map(String).filter(Boolean);

  try {
    const afiliacionId = await prisma.$transaction(async (tx) => {
      // Buscar cotizante existente en la misma sucursal (la unique ahora es
      // compuesta [sucursalId, tipoDocumento, numeroDocumento]). Si existe,
      // actualizar datos demográficos; si no, crear uno nuevo amarrado a
      // la sucursal resuelta arriba.
      const existing = await tx.cotizante.findFirst({
        where: {
          sucursalId: sucursalIdCotizante,
          tipoDocumento: cotParsed.data.tipoDocumento,
          numeroDocumento: cotParsed.data.numeroDocumento,
        },
        select: { id: true },
      });
      const cotizante = existing
        ? await tx.cotizante.update({
            where: { id: existing.id },
            data: cotParsed.data,
          })
        : await tx.cotizante.create({
            data: { ...cotParsed.data, sucursalId: sucursalIdCotizante },
          });

      const af = await tx.afiliacion.create({
        data: {
          cotizanteId: cotizante.id,
          modalidad: normalized.modalidad as 'DEPENDIENTE' | 'INDEPENDIENTE',
          empresaId: normalized.empresaId,
          cuentaCobroId: afParsed.data.cuentaCobroId,
          asesorComercialId: afParsed.data.asesorComercialId,
          planSgssId: normalized.planSgssId,
          actividadEconomicaId: normalized.actividadEconomicaId,
          tipoCotizanteId: normalized.tipoCotizanteId,
          subtipoId: normalized.subtipoId,
          nivelRiesgo: normalized.nivelRiesgo as 'I' | 'II' | 'III' | 'IV' | 'V',
          regimen: (normalized.regimen as 'ORDINARIO' | 'RESOLUCION' | null) ?? null,
          formaPago: afParsed.data.formaPago,
          estado: afParsed.data.estado,
          salario: normalized.salario,
          valorAdministracion: afParsed.data.valorAdministracion,
          fechaIngreso: afParsed.data.fechaIngreso,
          comentarios: afParsed.data.comentarios,
          epsId: normalized.epsId,
          afpId: normalized.afpId,
          arlId: normalized.arlId,
          ccfId: normalized.ccfId,
        },
      });

      if (serviciosIds.length > 0) {
        await tx.afiliacionServicio.createMany({
          data: serviciosIds.map((sId) => ({ afiliacionId: af.id, servicioAdicionalId: sId })),
          skipDuplicates: true,
        });
      }
      return af.id;
    });

    await logAudit({
      entidad: 'Afiliacion',
      entidadId: afiliacionId,
      accion: 'CREAR',
      descripcion: `Afiliación creada para ${cotParsed.data.primerNombre} ${cotParsed.data.primerApellido}`,
      cambios: { despues: normalized },
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

// ============ UPDATE ============

export async function updateAfiliacionAction(
  afiliacionId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const afParsed = AfiliacionSchema.safeParse(parseAfiliacion(formData));
  if (!afParsed.success) {
    return { error: afParsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const existing = await prisma.afiliacion.findUnique({
    where: { id: afiliacionId },
    include: {
      serviciosAdicionales: { select: { servicioAdicionalId: true } },
      cotizante: { select: { sucursalId: true } },
    },
  });
  if (!existing) return { error: 'Afiliación no encontrada' };

  // Scope: un usuario SUCURSAL sólo puede editar afiliaciones cuyo cotizante
  // pertenece a su sucursal. STAFF puede editar cualquiera.
  const scope = await getUserScope();
  if (!scope) return { error: 'Sesión inválida' };
  if (
    scope.tipo === 'SUCURSAL' &&
    existing.cotizante.sucursalId !== scope.sucursalId
  ) {
    return { error: 'No tienes permiso sobre esta afiliación' };
  }
  if (
    scope.tipo === 'SUCURSAL' &&
    afParsed.data.cuentaCobroId
  ) {
    const cc = await prisma.cuentaCobro.findUnique({
      where: { id: afParsed.data.cuentaCobroId },
      select: { sucursalId: true },
    });
    if (!cc || cc.sucursalId !== scope.sucursalId) {
      return { error: 'La cuenta de cobro no pertenece a tu sucursal' };
    }
  }

  // Bloqueo: si el cotizante tiene algún comprobante activo en una
  // planilla CONSOLIDADO o PAGADA, la afiliación no se puede modificar
  // porque alteraría datos que ya se reportaron al operador PILA.
  const planillasActivas = await prisma.planillaComprobante.findMany({
    where: {
      comprobante: {
        cotizanteId: existing.cotizanteId,
        estado: { not: 'ANULADO' },
      },
      planilla: { estado: { in: ['CONSOLIDADO', 'PAGADA'] } },
    },
    select: {
      planilla: {
        select: {
          consecutivo: true,
          estado: true,
          numeroPlanillaExt: true,
        },
      },
    },
    take: 1,
  });
  const planillaBloq = planillasActivas[0]?.planilla;
  if (planillaBloq) {
    const ref =
      planillaBloq.estado === 'PAGADA' && planillaBloq.numeroPlanillaExt
        ? `planilla ${planillaBloq.numeroPlanillaExt} (pagada)`
        : `planilla ${planillaBloq.consecutivo} (${planillaBloq.estado === 'PAGADA' ? 'pagada' : 'guardada'})`;
    return {
      error: `No se puede modificar la afiliación: el cotizante tiene un comprobante en ${ref}. Anula la planilla en Planos antes de editar.`,
    };
  }

  // (3) Cascada: limpiar IDs de entidades que no aplican al plan
  const { normalized, plan } = await prepararPayload(afParsed.data);

  // (2)(4) Validaciones: régimen, restricciones por plan, empresa cruzada
  const validationError = await validateAfiliacion(normalized, plan);
  if (validationError) return { error: validationError };

  const serviciosIds = formData.getAll('servicioId').map(String).filter(Boolean);
  const serviciosPrev = existing.serviciosAdicionales.map((s) => s.servicioAdicionalId).sort();
  const serviciosNew = [...serviciosIds].sort();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.afiliacion.update({
        where: { id: afiliacionId },
        data: {
          modalidad: normalized.modalidad as 'DEPENDIENTE' | 'INDEPENDIENTE',
          empresaId: normalized.empresaId,
          cuentaCobroId: afParsed.data.cuentaCobroId,
          asesorComercialId: afParsed.data.asesorComercialId,
          planSgssId: normalized.planSgssId,
          actividadEconomicaId: normalized.actividadEconomicaId,
          tipoCotizanteId: normalized.tipoCotizanteId,
          subtipoId: normalized.subtipoId,
          nivelRiesgo: normalized.nivelRiesgo as 'I' | 'II' | 'III' | 'IV' | 'V',
          regimen: (normalized.regimen as 'ORDINARIO' | 'RESOLUCION' | null) ?? null,
          formaPago: afParsed.data.formaPago,
          estado: afParsed.data.estado,
          salario: normalized.salario,
          valorAdministracion: afParsed.data.valorAdministracion,
          fechaIngreso: afParsed.data.fechaIngreso,
          comentarios: afParsed.data.comentarios,
          epsId: normalized.epsId,
          afpId: normalized.afpId,
          arlId: normalized.arlId,
          ccfId: normalized.ccfId,
        },
      });

      // Servicios: sync completo (wipe + insert)
      if (JSON.stringify(serviciosPrev) !== JSON.stringify(serviciosNew)) {
        await tx.afiliacionServicio.deleteMany({ where: { afiliacionId } });
        if (serviciosNew.length > 0) {
          await tx.afiliacionServicio.createMany({
            data: serviciosNew.map((sId) => ({ afiliacionId, servicioAdicionalId: sId })),
            skipDuplicates: true,
          });
        }
      }
    });

    await logAudit({
      entidad: 'Afiliacion',
      entidadId: afiliacionId,
      accion: 'EDITAR',
      descripcion: 'Afiliación actualizada',
      cambios: { antes: existing, despues: afParsed.data },
    });
  } catch {
    return { error: 'Error al actualizar' };
  }

  revalidatePath('/admin/base-datos');
  return { ok: true };
}

// ============ Toggle estado (action simple sin form) ============

export async function toggleEstadoAfiliacionAction(afiliacionId: string) {
  await requireAdmin();
  const a = await prisma.afiliacion.findUnique({
    where: { id: afiliacionId },
    include: { cotizante: { select: { sucursalId: true } } },
  });
  if (!a) return;

  // Scope: SUCURSAL sólo sobre sus cotizantes.
  const scope = await getUserScope();
  if (!scope) return;
  if (scope.tipo === 'SUCURSAL' && a.cotizante.sucursalId !== scope.sucursalId) {
    return;
  }

  const nuevoEstado = a.estado === 'ACTIVA' ? 'INACTIVA' : 'ACTIVA';
  await prisma.afiliacion.update({
    where: { id: afiliacionId },
    data: {
      estado: nuevoEstado,
      fechaRetiro: nuevoEstado === 'INACTIVA' ? new Date() : null,
    },
  });

  await logAudit({
    entidad: 'Afiliacion',
    entidadId: afiliacionId,
    accion: 'TOGGLE',
    descripcion: `Estado cambiado de ${a.estado} a ${nuevoEstado}`,
    cambios: { antes: { estado: a.estado }, despues: { estado: nuevoEstado } },
  });

  revalidatePath('/admin/base-datos');
}
