'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { auditarCreate, auditarUpdate, auditarEvento } from '@/lib/auditoria';
import { EmpresaCreateSchema, EmpresaUpdateSchema } from '@/lib/validations';
import { titleCase } from '@/lib/text';

export type ActionState = {
  error?: string;
  ok?: boolean;
  /** Sprint reorg — `id` de la empresa recién creada, para que el
   *  modal con tabs pueda transicionar de Tab 1 (CREATE) a las tabs
   *  de PILA y Colpatria sin redirigir el browser. */
  id?: string;
};

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
    fechaInicioActividades: get('fechaInicioActividades'),
    pagosimpleContributorId: get('pagosimpleContributorId'),
  };
}

export async function createEmpresaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = EmpresaCreateSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  let creada;
  try {
    creada = await prisma.empresa.create({ data: parsed.data });
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes('Unique')
        ? 'Ya existe una empresa con ese NIT'
        : 'Error al crear empresa';
    return { error: msg };
  }

  // Empresa es una entidad GLOBAL — no scopeada a sucursal. Por eso
  // entidadSucursalId queda null y solo STAFF la verá en su bitácora.
  await auditarCreate({
    entidad: 'Empresa',
    entidadId: creada.id,
    descripcion: `Empresa creada: ${creada.nombre} (NIT ${creada.nit})`,
    despues: { ...parsed.data, id: creada.id },
  });

  revalidatePath('/admin/empresas');
  return { ok: true, id: creada.id };
}

export async function updateEmpresaAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = EmpresaUpdateSchema.safeParse({
    ...parseForm(formData),
    active: formData.get('active') === 'on',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  // Snapshot antes para diff fino — sólo guardamos los campos que el form
  // controla, no el objeto Prisma completo (evita ruido por campos derivados
  // tipo `updatedAt` que cambian en cada save).
  const antes = await prisma.empresa.findUnique({
    where: { id },
    select: {
      nit: true,
      dv: true,
      nombre: true,
      nombreComercial: true,
      tipoPersona: true,
      repLegalTipoDoc: true,
      repLegalNumeroDoc: true,
      repLegalNombre: true,
      direccion: true,
      ciudad: true,
      departamento: true,
      departamentoId: true,
      municipioId: true,
      telefono: true,
      email: true,
      ciiuPrincipal: true,
      arlId: true,
      exoneraLey1607: true,
      fechaInicioActividades: true,
      pagosimpleContributorId: true,
      active: true,
    },
  });
  if (!antes) return { error: 'Empresa no encontrada' };

  try {
    await prisma.empresa.update({ where: { id }, data: parsed.data });
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes('Unique') ? 'NIT duplicado' : 'Error al actualizar';
    return { error: msg };
  }

  await auditarUpdate({
    entidad: 'Empresa',
    entidadId: id,
    antes: antes as unknown as Record<string, unknown>,
    despues: parsed.data as unknown as Record<string, unknown>,
  });

  revalidatePath('/admin/empresas');
  redirect('/admin/empresas');
}

/**
 * Sprint reorg — Modal con tabs.
 *
 * Devuelve un snapshot completo de una empresa: datos básicos +
 * configuración PILA (niveles, actividades, tipos cotizante,
 * subtipos) + estado Colpatria (credenciales, selectores, mapeo
 * por nivel).
 *
 * Calculamos también las flags de completitud `basicos`, `pila`,
 * `colpatria` para pintar los indicadores ✓ / ⚠ en cada tab.
 *
 * Solo STAFF — el modal solo se abre desde la lista de empresas
 * que ya está restringida.
 */
export async function obtenerEstadoEmpresa(id: string) {
  await requireStaff();

  const empresa = await prisma.empresa.findUnique({
    where: { id },
    include: {
      arl: { select: { id: true, codigo: true, nombre: true } },
      nivelesPermitidos: {
        select: {
          nivel: true,
          colpatriaCentroTrabajo: true,
          colpatriaGrupoOcupacion: true,
          colpatriaTipoOcupacion: true,
        },
      },
      actividadesPermitidas: { select: { actividadEconomicaId: true } },
      tiposPermitidos: { select: { tipoCotizanteId: true } },
      subtiposPermitidos: { select: { subtipoId: true } },
    },
  });
  if (!empresa) return null;

  // Completitud — interpretación pragmática:
  //   - basicos: nit, nombre, ARL configurada → suficiente para crear PILA
  //   - pila: tiene al menos 1 nivel + 1 tipo cotizante permitido
  //   - colpatria: tiene credenciales (usuario + password) Y todos los
  //     defaults principales (sucursal, tipoAfiliacion, grupo, tipo
  //     ocupación). Si `colpatriaActivo=false`, igual evaluamos "ok"
  //     porque la empresa puede no requerir el bot.
  const basicosOk = Boolean(empresa.nit && empresa.nombre && empresa.arlId);
  const pilaOk = empresa.nivelesPermitidos.length > 0 && empresa.tiposPermitidos.length > 0;
  const colpatriaOk = empresa.colpatriaActivo
    ? Boolean(
        empresa.colpatriaUsuario &&
        empresa.colpatriaPasswordEnc &&
        empresa.colpatriaCodigoSucursalDefault &&
        empresa.colpatriaTipoAfiliacionDefault &&
        empresa.colpatriaGrupoOcupacionDefault &&
        empresa.colpatriaTipoOcupacionDefault,
      )
    : true; // si bot inactivo, la tab no es bloqueante

  return {
    empresa,
    completitud: {
      basicos: basicosOk,
      pila: pilaOk,
      colpatria: colpatriaOk,
    },
  };
}

export async function toggleEmpresaAction(id: string) {
  await requireStaff();
  const e = await prisma.empresa.findUnique({ where: { id } });
  if (!e) return;
  const nuevoEstado = !e.active;
  await prisma.empresa.update({ where: { id }, data: { active: nuevoEstado } });

  await auditarEvento({
    entidad: 'Empresa',
    entidadId: id,
    accion: 'TOGGLE',
    descripcion: `Empresa ${e.nombre} ${nuevoEstado ? 'activada' : 'desactivada'}`,
    cambios: {
      antes: { active: e.active },
      despues: { active: nuevoEstado },
      campos: ['active'],
    },
  });

  revalidatePath('/admin/empresas');
}
