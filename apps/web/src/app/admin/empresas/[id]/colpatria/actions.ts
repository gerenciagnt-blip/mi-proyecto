'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { encrypt, esDescifrable } from '@/lib/colpatria/crypto';
import { auditarEvento } from '@/lib/auditoria';

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
    },
  });
  if (!e) return null;
  return {
    activo: e.colpatriaActivo,
    usuario: e.colpatriaUsuario,
    passwordOk: esDescifrable(e.colpatriaPasswordEnc),
    passwordSetAt: e.colpatriaPasswordSetAt,
  };
}
