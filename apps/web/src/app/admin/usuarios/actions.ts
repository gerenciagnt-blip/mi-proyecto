'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { UserCreateSchema, UserUpdateSchema, UserPasswordSchema } from '@/lib/validations';
import { titleCase } from '@/lib/text';

export type ActionState = { error?: string; ok?: boolean };

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const role = String(formData.get('role') ?? '');
  const sucursalRaw = String(formData.get('sucursalId') ?? '');
  const rolCustomRaw = String(formData.get('rolCustomId') ?? '');
  const esStaff = role === 'ADMIN' || role === 'SOPORTE';
  const parsed = UserCreateSchema.safeParse({
    email: String(formData.get('email') ?? '')
      .toLowerCase()
      .trim(),
    name: titleCase(String(formData.get('name') ?? '').trim()),
    password: String(formData.get('password') ?? ''),
    role,
    sucursalId: esStaff ? null : sucursalRaw || null,
    rolCustomId: rolCustomRaw || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  // Validar que el rol custom (si se pasó) sea compatible con el rol base
  if (parsed.data.rolCustomId) {
    const rc = await prisma.rolCustom.findUnique({
      where: { id: parsed.data.rolCustomId },
      select: { basedOn: true, active: true },
    });
    if (!rc || !rc.active) {
      return { error: 'Rol personalizado no existe o está inactivo' };
    }
    if (rc.basedOn !== parsed.data.role) {
      return {
        error: `El rol personalizado no aplica al nivel ${parsed.data.role}`,
      };
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
        sucursalId: parsed.data.sucursalId,
        rolCustomId: parsed.data.rolCustomId ?? null,
      },
    });
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes('Unique')
        ? 'Ya existe un usuario con ese email'
        : 'Error al crear usuario';
    return { error: msg };
  }

  revalidatePath('/admin/usuarios');
  return { ok: true };
}

export async function updateUserAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();
  const esSelf = session.user.id === id;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return { error: 'Usuario no existe' };

  // Protección auto-cambio: si se está editando el propio usuario, forzar
  // rol/sucursal/active a los valores actuales (ignorando el form), para
  // evitar que se quite su propio acceso por accidente o manipulación.
  const role = esSelf ? existing.role : String(formData.get('role') ?? '');
  const sucursalRaw = esSelf
    ? (existing.sucursalId ?? '')
    : String(formData.get('sucursalId') ?? '');
  const rolCustomRaw = esSelf
    ? (existing.rolCustomId ?? '')
    : String(formData.get('rolCustomId') ?? '');
  const active = esSelf ? existing.active : formData.get('active') === 'on';
  const esStaff = role === 'ADMIN' || role === 'SOPORTE';

  const parsed = UserUpdateSchema.safeParse({
    name: titleCase(String(formData.get('name') ?? '').trim()),
    role,
    sucursalId: esStaff ? null : sucursalRaw || null,
    rolCustomId: rolCustomRaw || null,
    active,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  // Validar compatibilidad del rol custom con el rol base
  if (parsed.data.rolCustomId) {
    const rc = await prisma.rolCustom.findUnique({
      where: { id: parsed.data.rolCustomId },
      select: { basedOn: true, active: true },
    });
    if (!rc || !rc.active) {
      return { error: 'Rol personalizado no existe o está inactivo' };
    }
    if (rc.basedOn !== parsed.data.role) {
      return {
        error: `El rol personalizado no aplica al nivel ${parsed.data.role}`,
      };
    }
  }

  // Si es ALIADO_OWNER y tiene sucursal, intentamos actualizar las tarifas
  // de cobro de esa sucursal (Decimal nullable — vacío = sin cambio).
  let tarifaOrdinario: number | null | undefined;
  let tarifaResolucion: number | null | undefined;
  if (parsed.data.role === 'ALIADO_OWNER' && parsed.data.sucursalId && !esSelf) {
    const rawOrd = String(formData.get('tarifaOrdinario') ?? '').trim();
    const rawRes = String(formData.get('tarifaResolucion') ?? '').trim();
    if (rawOrd !== '') {
      const n = Number(rawOrd);
      if (!Number.isFinite(n) || n < 0) {
        return { error: 'Tarifa ORDINARIO inválida (debe ser un número ≥ 0)' };
      }
      tarifaOrdinario = n;
    } else {
      tarifaOrdinario = null; // usuario borró el valor
    }
    if (rawRes !== '') {
      const n = Number(rawRes);
      if (!Number.isFinite(n) || n < 0) {
        return { error: 'Tarifa RESOLUCIÓN inválida (debe ser un número ≥ 0)' };
      }
      tarifaResolucion = n;
    } else {
      tarifaResolucion = null;
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: parsed.data });

      // Actualiza tarifas de la sucursal (solo si venimos de form ALIADO_OWNER)
      if (
        parsed.data.role === 'ALIADO_OWNER' &&
        parsed.data.sucursalId &&
        tarifaOrdinario !== undefined
      ) {
        await tx.sucursal.update({
          where: { id: parsed.data.sucursalId },
          data: { tarifaOrdinario, tarifaResolucion },
        });
      }
    });
  } catch {
    return { error: 'Error al actualizar usuario' };
  }

  revalidatePath('/admin/usuarios');
  redirect('/admin/usuarios');
}

export async function toggleUserAction(id: string) {
  const session = await requireStaff();
  if (session.user.id === id) return; // no permitir auto-desactivar
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return;
  await prisma.user.update({ where: { id }, data: { active: !u.active } });
  revalidatePath('/admin/usuarios');
}

export async function resetPasswordAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = UserPasswordSchema.safeParse({
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Contraseña inválida' };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  revalidatePath('/admin/usuarios');
  return { ok: true };
}
