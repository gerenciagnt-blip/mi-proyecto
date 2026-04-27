'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import type { NivelRiesgo } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { encrypt, esDescifrable } from '@/lib/colpatria/crypto';
import { auditarEvento } from '@/lib/auditoria';

const NIVELES_VALIDOS: NivelRiesgo[] = ['I', 'II', 'III', 'IV', 'V'];

export type ActionState = { error?: string; ok?: boolean };

/**
 * Configura o actualiza las credenciales del portal Colpatria ARL para
 * una empresa planilla. Solo ADMIN puede hacerlo (las credenciales son
 * compartidas entre todos los usuarios del sistema y dan acceso a un
 * portal externo, así que el blast radius es alto).
 *
 * El password viaja como string desde el form, se encripta con AES-256-GCM
 * antes de guardar. Una vez guardado, la UI nunca lo vuelve a mostrar
 * — solo expone "configurado / no configurado".
 *
 * Soporta tres operaciones según los campos del FormData:
 *   - Setear/cambiar credenciales: usuario + password
 *   - Solo activar/desactivar: campo `activo` sin tocar password
 *   - Limpiar credenciales: ambos vacíos + activo=false
 */
export async function configurarColpatriaAction(
  empresaId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) return { error: 'Empresa no encontrada' };

  const usuarioRaw = String(formData.get('usuario') ?? '').trim();
  const passwordRaw = String(formData.get('password') ?? '');
  const activo = formData.get('activo') === 'on';

  // Si vienen ambos vacíos y activo=false, es "limpiar credenciales".
  // No bloqueamos esto — un ADMIN puede querer desconfigurar una empresa.
  const limpiar = usuarioRaw === '' && passwordRaw === '' && !activo;

  if (limpiar) {
    await prisma.empresa.update({
      where: { id: empresaId },
      data: {
        colpatriaUsuario: null,
        colpatriaPasswordEnc: null,
        colpatriaPasswordSetAt: null,
        colpatriaActivo: false,
      },
    });
    // También invalidamos la sesión cacheada (si la había), porque las
    // credenciales viejas ya no aplican.
    await prisma.colpatriaSesion.deleteMany({ where: { empresaId } });

    void auditarEvento({
      entidad: 'Empresa',
      entidadId: empresaId,
      accion: 'COLPATRIA_LIMPIAR',
      descripcion: `Limpieza de credenciales Colpatria para ${empresa.nombre}`,
    });

    revalidatePath(`/admin/empresas/${empresaId}/colpatria`);
    return { ok: true };
  }

  // Si quiere activar, debe tener al menos usuario configurado (password
  // puede venir vacío si ya estaba seteado y el ADMIN solo está activando).
  if (activo && !usuarioRaw && !empresa.colpatriaUsuario) {
    return { error: 'Para activar el bot, primero configura usuario y password' };
  }

  // Validaciones del input
  if (usuarioRaw.length > 0 && usuarioRaw.length > 200) {
    return { error: 'Usuario demasiado largo (máx 200)' };
  }
  if (passwordRaw.length > 0 && passwordRaw.length > 500) {
    return { error: 'Password demasiado largo (máx 500)' };
  }

  // Construimos el patch parcialmente: solo actualiza lo que vino.
  const data: {
    colpatriaUsuario?: string;
    colpatriaPasswordEnc?: string;
    colpatriaPasswordSetAt?: Date;
    colpatriaActivo: boolean;
  } = { colpatriaActivo: activo };

  if (usuarioRaw !== '') data.colpatriaUsuario = usuarioRaw;

  if (passwordRaw !== '') {
    try {
      data.colpatriaPasswordEnc = encrypt(passwordRaw);
      data.colpatriaPasswordSetAt = new Date();
    } catch (err) {
      // Único caso: COLPATRIA_ENC_KEY no configurada en .env.
      return {
        error:
          err instanceof Error && err.message.includes('COLPATRIA_ENC_KEY')
            ? 'COLPATRIA_ENC_KEY no está configurada en el servidor. Avisa a infra.'
            : 'Error al encriptar la credencial',
      };
    }
  }

  await prisma.empresa.update({ where: { id: empresaId }, data });

  // Si el password cambió, invalidar la sesión cacheada — la nueva clave
  // no compatible con el storageState anterior.
  if (passwordRaw !== '') {
    await prisma.colpatriaSesion.deleteMany({ where: { empresaId } });
  }

  void auditarEvento({
    entidad: 'Empresa',
    entidadId: empresaId,
    accion: passwordRaw !== '' ? 'COLPATRIA_CREDENCIALES' : 'COLPATRIA_TOGGLE',
    descripcion:
      passwordRaw !== ''
        ? `Credenciales Colpatria actualizadas para ${empresa.nombre} · activo=${activo}`
        : `Bot Colpatria ${activo ? 'activado' : 'desactivado'} para ${empresa.nombre}`,
  });

  revalidatePath(`/admin/empresas/${empresaId}/colpatria`);
  return { ok: true };
}

/**
 * Tipo expuesto al cliente — NUNCA incluye el password descifrado.
 * Solo flags de "tiene credenciales configuradas".
 */
export type ColpatriaConfigEstado = {
  activo: boolean;
  usuario: string | null;
  /** True si hay password encriptado guardado y se puede descifrar. */
  passwordOk: boolean;
  /** Última vez que se cambió el password. */
  passwordSetAt: Date | null;
  // --- Selectores AXA y defaults del form ---
  aplicacion: string;
  perfil: string;
  empresaIdInterno: string | null;
  afiliacionId: string | null;
  codigoSucursalDefault: string | null;
  tipoAfiliacionDefault: string | null;
  grupoOcupacionDefault: string | null;
  tipoOcupacionDefault: string | null;
};

/**
 * Lee el estado actual de configuración para mostrar en la UI. No
 * devuelve el password ni siquiera encriptado — solo el flag de que
 * hay uno guardado y descifrable con la key actual.
 */
export async function obtenerEstadoColpatria(
  empresaId: string,
): Promise<ColpatriaConfigEstado | null> {
  await requireAdmin();
  const e = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: {
      colpatriaActivo: true,
      colpatriaUsuario: true,
      colpatriaPasswordEnc: true,
      colpatriaPasswordSetAt: true,
      colpatriaAplicacion: true,
      colpatriaPerfil: true,
      colpatriaEmpresaIdInterno: true,
      colpatriaAfiliacionId: true,
      colpatriaCodigoSucursalDefault: true,
      colpatriaTipoAfiliacionDefault: true,
      colpatriaGrupoOcupacionDefault: true,
      colpatriaTipoOcupacionDefault: true,
    },
  });
  if (!e) return null;
  return {
    activo: e.colpatriaActivo,
    usuario: e.colpatriaUsuario,
    passwordOk: esDescifrable(e.colpatriaPasswordEnc),
    passwordSetAt: e.colpatriaPasswordSetAt,
    aplicacion: e.colpatriaAplicacion ?? 'ARP',
    perfil: e.colpatriaPerfil ?? 'OFI',
    empresaIdInterno: e.colpatriaEmpresaIdInterno,
    afiliacionId: e.colpatriaAfiliacionId,
    codigoSucursalDefault: e.colpatriaCodigoSucursalDefault,
    tipoAfiliacionDefault: e.colpatriaTipoAfiliacionDefault,
    grupoOcupacionDefault: e.colpatriaGrupoOcupacionDefault,
    tipoOcupacionDefault: e.colpatriaTipoOcupacionDefault,
  };
}

/**
 * Actualiza los selectores AXA (Aplicación/Perfil/EmpresaId/Afiliacion)
 * y los defaults del form de Ingreso Individual. Separado de las
 * credenciales para que cada cosa se pueda cambiar sin tocar la otra
 * (ej. rotar password sin rellenar todos los selectores).
 */
export async function actualizarConfigColpatriaAction(
  empresaId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) return { error: 'Empresa no encontrada' };

  const get = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? null : v;
  };

  const aplicacion = get('aplicacion') ?? 'ARP';
  const perfil = get('perfil') ?? 'OFI';
  const empresaIdInterno = get('empresaIdInterno');
  const afiliacionId = get('afiliacionId');
  const codigoSucursal = get('codigoSucursalDefault');
  const tipoAfiliacion = get('tipoAfiliacionDefault');
  const grupoOcupacion = get('grupoOcupacionDefault');
  const tipoOcupacion = get('tipoOcupacionDefault');

  // Validaciones livianas
  if (perfil !== 'OFI' && perfil !== 'OPE') {
    return { error: 'Perfil debe ser OFI u OPE' };
  }

  await prisma.empresa.update({
    where: { id: empresaId },
    data: {
      colpatriaAplicacion: aplicacion,
      colpatriaPerfil: perfil,
      colpatriaEmpresaIdInterno: empresaIdInterno,
      colpatriaAfiliacionId: afiliacionId,
      colpatriaCodigoSucursalDefault: codigoSucursal,
      colpatriaTipoAfiliacionDefault: tipoAfiliacion,
      colpatriaGrupoOcupacionDefault: grupoOcupacion,
      colpatriaTipoOcupacionDefault: tipoOcupacion,
    },
  });

  // Cambiar la config invalida la sesión cacheada (los selectores del
  // /Bienvenida cambiaron y la cookie ya no aplica al perfil correcto).
  await prisma.colpatriaSesion.deleteMany({ where: { empresaId } });

  void auditarEvento({
    entidad: 'Empresa',
    entidadId: empresaId,
    accion: 'COLPATRIA_CONFIG',
    descripcion: `Config del bot Colpatria actualizada para ${empresa.nombre}`,
  });

  revalidatePath(`/admin/empresas/${empresaId}/colpatria`);
  return { ok: true };
}

/**
 * Actualiza el mapeo nivel de riesgo → código de centro de trabajo
 * Colpatria. Solo aplica para los niveles que la empresa ya tiene
 * marcados como permitidos en `EmpresaNivelRiesgo`.
 *
 * Cada par (empresaId, nivel) se updatea en su fila existente. Si
 * el form trae código vacío, se setea a null (= usar default sucursal).
 */
export async function actualizarCentrosTrabajoAction(
  empresaId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, nombre: true },
  });
  if (!empresa) return { error: 'Empresa no encontrada' };

  // Levantamos los niveles ya permitidos.
  const niveles = await prisma.empresaNivelRiesgo.findMany({
    where: { empresaId },
    select: { nivel: true },
  });
  if (niveles.length === 0) {
    return {
      error:
        'Esta empresa no tiene niveles de riesgo permitidos. Configúralos primero en Configuración PILA.',
    };
  }

  // Validar y aplicar cada nivel. Cada nivel persiste 3 valores
  // independientes (centro de trabajo, grupo ocupación, tipo ocupación).
  // Si todos van vacíos, el bot caerá al default de empresa.
  const updates = niveles.map((n) => {
    const norm = (k: string) => {
      const raw = String(formData.get(`${k}_${n.nivel}`) ?? '').trim();
      return raw === '' ? null : raw;
    };
    return prisma.empresaNivelRiesgo.update({
      where: { empresaId_nivel: { empresaId, nivel: n.nivel } },
      data: {
        colpatriaCentroTrabajo: norm('centro'),
        colpatriaGrupoOcupacion: norm('grupo'),
        colpatriaTipoOcupacion: norm('tipo'),
      },
    });
  });

  await prisma.$transaction(updates);

  void auditarEvento({
    entidad: 'Empresa',
    entidadId: empresaId,
    accion: 'COLPATRIA_CENTROS',
    descripcion: `Mapeo nivel→centro/grupo/tipo Colpatria actualizado para ${empresa.nombre}`,
  });

  revalidatePath(`/admin/empresas/${empresaId}/colpatria`);
  return { ok: true };
}

export type CentroTrabajoMapeo = {
  nivel: NivelRiesgo;
  colpatriaCentroTrabajo: string | null;
  colpatriaGrupoOcupacion: string | null;
  colpatriaTipoOcupacion: string | null;
};

/**
 * Lee los niveles permitidos + su mapeo a centro de trabajo, grupo y
 * tipo de ocupación Colpatria. Si la empresa no tiene niveles
 * configurados, devuelve []. La UI lo usa para informar al ADMIN que
 * primero debe configurar PILA.
 */
export async function obtenerCentrosTrabajo(empresaId: string): Promise<CentroTrabajoMapeo[]> {
  await requireAdmin();
  const filas = await prisma.empresaNivelRiesgo.findMany({
    where: { empresaId },
    select: {
      nivel: true,
      colpatriaCentroTrabajo: true,
      colpatriaGrupoOcupacion: true,
      colpatriaTipoOcupacion: true,
    },
  });
  // Ordenar I, II, III, IV, V
  const orden: Record<NivelRiesgo, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  return filas
    .filter((f) => NIVELES_VALIDOS.includes(f.nivel))
    .sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}
