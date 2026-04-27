'use server';

/**
 * Sprint Soporte reorg fase 2 — Server actions del modal "Mi perfil".
 *
 * Cualquier usuario autenticado (ADMIN, SOPORTE, ALIADO_OWNER, ALIADO_USER)
 * puede cambiar su propia contraseña. La regla es:
 *   - Conoce la contraseña actual (defensa contra sesión secuestrada).
 *   - La nueva ≠ la actual.
 *   - La nueva tiene mínimo 8 caracteres.
 *   - La confirmación coincide.
 *
 * No registramos el valor en auditoría (solo el evento + actor + fecha).
 */

import bcrypt from 'bcryptjs';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { auditarEvento } from '@/lib/auditoria';

export type CambiarPasswordState = {
  error?: string;
  ok?: boolean;
};

export async function cambiarPasswordAction(
  _prev: CambiarPasswordState,
  formData: FormData,
): Promise<CambiarPasswordState> {
  const session = await requireAuth();
  const userId = session.user.id;

  const actual = String(formData.get('actual') ?? '');
  const nueva = String(formData.get('nueva') ?? '');
  const confirmacion = String(formData.get('confirmacion') ?? '');

  if (!actual || !nueva || !confirmacion) {
    return { error: 'Completa los tres campos' };
  }
  if (nueva.length < 8) {
    return { error: 'La nueva contraseña debe tener al menos 8 caracteres' };
  }
  if (nueva === actual) {
    return { error: 'La nueva contraseña no puede ser igual a la actual' };
  }
  if (nueva !== confirmacion) {
    return { error: 'La confirmación no coincide con la nueva contraseña' };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, sucursalId: true },
  });
  if (!user) return { error: 'Usuario no encontrado' };

  const valida = await bcrypt.compare(actual, user.passwordHash);
  if (!valida) {
    return { error: 'La contraseña actual no es correcta' };
  }

  const nuevoHash = await bcrypt.hash(nueva, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: nuevoHash },
  });

  // Auditoría — registramos el EVENTO pero NO el valor de la contraseña.
  await auditarEvento({
    entidad: 'User',
    entidadId: userId,
    accion: 'CAMBIAR_PASSWORD_PROPIO',
    entidadSucursalId: user.sucursalId,
    descripcion: 'El usuario cambió su propia contraseña',
    cambios: null,
  });

  return { ok: true };
}
