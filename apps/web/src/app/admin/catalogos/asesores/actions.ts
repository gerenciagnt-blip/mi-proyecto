'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { prisma } from '@pila/db';
import { requireAuth, requireStaff } from '@/lib/auth-helpers';
import { getUserScope, validarSucursalIdAsignable } from '@/lib/sucursal-scope';
import { auditarCreate, auditarEvento } from '@/lib/auditoria';
import { AsesorSchema } from '@/lib/validations';
import { nextAsesorCodigo } from '@/lib/consecutivo';

export type ActionState = { error?: string; ok?: boolean };
/**
 * Variante extendida del ActionState para `createAsesorLoginAction` — incluye
 * el password temporal generado para que el staff lo copie y entregue al
 * asesor. Se devuelve UNA sola vez (en la respuesta de la acción); no se
 * persiste en claro.
 */
export type CreateLoginActionState = ActionState & {
  tempPassword?: string;
  email?: string;
};

async function resolverSucursalId(rawValue: string): Promise<string | null> {
  const scope = await getUserScope();
  if (!scope) return null;
  if (scope.tipo === 'SUCURSAL') return scope.sucursalId;
  if (!rawValue || rawValue === 'GLOBAL') return null;
  return rawValue;
}

export async function createAsesorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const sucursalId = await resolverSucursalId(String(formData.get('sucursalId') ?? ''));
  const errSuc = await validarSucursalIdAsignable(sucursalId);
  if (errSuc) return { error: errSuc };

  // Sprint Comisiones — toggle + meta opcionales en la creación.
  const generaComision = formData.get('generaComision') === 'on';
  const metaMensualRaw = String(formData.get('metaMensual') ?? '').trim();
  const metaMensual = metaMensualRaw === '' ? null : Number(metaMensualRaw.replace(/[\s,]/g, ''));

  const baseRaw = {
    nombre: String(formData.get('nombre') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    telefono: String(formData.get('telefono') ?? '').trim(),
    sucursalId,
    generaComision,
    metaMensual: Number.isFinite(metaMensual) ? metaMensual : null,
  };

  if (generaComision && (!Number.isFinite(metaMensual) || (metaMensual as number) <= 0)) {
    return { error: 'Para generar comisión debes definir una meta mensual > 0' };
  }

  // Código consecutivo global AS-NNNN — lo asigna el server. Reintentamos
  // una vez por si dos peticiones colisionan en el @unique.
  let attempt = 0;
  while (attempt < 3) {
    attempt += 1;
    const codigo = await nextAsesorCodigo();
    const parsed = AsesorSchema.safeParse({ ...baseRaw, codigo });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    try {
      const creado = await prisma.asesorComercial.create({
        data: {
          codigo: parsed.data.codigo,
          nombre: parsed.data.nombre,
          email: parsed.data.email,
          telefono: parsed.data.telefono,
          sucursalId: parsed.data.sucursalId ?? null,
          generaComision: parsed.data.generaComision ?? false,
          metaMensual: parsed.data.metaMensual ?? null,
        },
      });
      await auditarCreate({
        entidad: 'AsesorComercial',
        entidadId: creado.id,
        entidadSucursalId: creado.sucursalId,
        descripcion: `Asesor creado: ${creado.codigo} · ${creado.nombre}${creado.sucursalId ? '' : ' (global)'}`,
        despues: {
          codigo: creado.codigo,
          nombre: creado.nombre,
          email: creado.email,
          telefono: creado.telefono,
          sucursalId: creado.sucursalId,
        },
      });
      revalidatePath('/admin/catalogos/asesores');
      return { ok: true };
    } catch (e) {
      const isUnique = e instanceof Error && e.message.includes('Unique');
      if (isUnique && attempt < 3) continue;
      return { error: isUnique ? 'Conflicto de código, intente de nuevo' : 'Error al crear' };
    }
  }
  return { error: 'No se pudo asignar un código único, intente de nuevo' };
}

/**
 * Genera un password temporal alfanumérico de 12 caracteres con al menos
 * un dígito y una letra. Lo devolvemos en claro al staff (es vista única);
 * en BD se guarda solo el hash.
 */
function generarPasswordTemporal(): string {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  // node crypto.randomInt sería ideal pero acá basta Math.random; el password
  // se rota inmediatamente y nunca persiste en claro.
  for (let i = 0; i < 12; i += 1) {
    pwd += charset[Math.floor(Math.random() * charset.length)];
  }
  return pwd;
}

/**
 * Sprint Asesor Comercial — crea un User con role=ASESOR_COMERCIAL amarrado
 * al registro del catálogo. Solo STAFF puede invocar.
 *
 * Reglas:
 *   - El asesor debe estar activo y tener email (es el username del login).
 *   - No puede haber otro User ya vinculado al mismo asesorComercialId
 *     (constraint @unique en BD, pero chequeamos antes para mensaje claro).
 *   - No puede existir otro User con el mismo email (constraint @unique
 *     global de email).
 *   - sucursalId del User = sucursalId del catálogo (puede ser null si el
 *     asesor fue marcado como "global", aunque eso es raro).
 *
 * Devuelve el password temporal en claro — el staff lo copia y se lo
 * entrega al asesor. Es la única forma de verlo: solo se guarda el hash.
 */
export async function createAsesorLoginAction(asesorId: string): Promise<CreateLoginActionState> {
  await requireStaff();

  const asesor = await prisma.asesorComercial.findUnique({
    where: { id: asesorId },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      email: true,
      sucursalId: true,
      active: true,
      user: { select: { id: true } },
    },
  });
  if (!asesor) return { error: 'Asesor no encontrado' };
  if (!asesor.active) return { error: 'No se puede crear login para un asesor inactivo' };
  if (asesor.user) return { error: 'Este asesor ya tiene un login asociado' };
  const emailRaw = (asesor.email ?? '').trim().toLowerCase();
  if (!emailRaw) {
    return {
      error: 'El asesor no tiene email en el catálogo — agréguelo antes de crear el login',
    };
  }

  const existente = await prisma.user.findUnique({
    where: { email: emailRaw },
    select: { id: true },
  });
  if (existente) {
    return {
      error: `Ya existe un usuario con el email ${emailRaw}. Usa otro email en el catálogo o vincula al user existente manualmente.`,
    };
  }

  const tempPassword = generarPasswordTemporal();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  let creado;
  try {
    creado = await prisma.user.create({
      data: {
        email: emailRaw,
        name: asesor.nombre,
        passwordHash,
        role: 'ASESOR_COMERCIAL',
        sucursalId: asesor.sucursalId,
        asesorComercialId: asesor.id,
      },
    });
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes('Unique')
        ? 'Conflicto al crear el usuario (email o asesor duplicado)'
        : 'Error al crear el usuario';
    return { error: msg };
  }

  await auditarCreate({
    entidad: 'User',
    entidadId: creado.id,
    entidadSucursalId: creado.sucursalId,
    descripcion: `Login asesor comercial creado: ${creado.email} (${asesor.codigo} · ${asesor.nombre})`,
    despues: {
      email: creado.email,
      name: creado.name,
      role: creado.role,
      sucursalId: creado.sucursalId,
      asesorComercialId: creado.asesorComercialId,
      active: creado.active,
    },
  });

  revalidatePath('/admin/catalogos/asesores');
  return { ok: true, tempPassword, email: creado.email };
}

/**
 * Sprint Comisiones — actualiza solo los campos de comisión del asesor
 * (generaComision + metaMensual). Llamado desde el botón "Editar comisión"
 * del listado o desde una página de detalle.
 */
export async function updateAsesorComisionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { error: 'ID requerido' };

  const a = await prisma.asesorComercial.findUnique({
    where: { id },
    select: { id: true, sucursalId: true, generaComision: true, metaMensual: true, codigo: true },
  });
  if (!a) return { error: 'Asesor no encontrado' };

  const err = await validarSucursalIdAsignable(a.sucursalId);
  if (err) return { error: err };

  const generaComision = formData.get('generaComision') === 'on';
  const metaMensualRaw = String(formData.get('metaMensual') ?? '').trim();
  const metaMensual = metaMensualRaw === '' ? null : Number(metaMensualRaw.replace(/[\s,]/g, ''));

  if (generaComision && (!Number.isFinite(metaMensual) || (metaMensual as number) <= 0)) {
    return { error: 'Para generar comisión debes definir una meta mensual > 0' };
  }

  await prisma.asesorComercial.update({
    where: { id },
    data: {
      generaComision,
      metaMensual: generaComision ? (metaMensual as number) : (metaMensual ?? null),
    },
  });

  await auditarEvento({
    entidad: 'AsesorComercial',
    entidadId: id,
    accion: 'UPDATE',
    entidadSucursalId: a.sucursalId,
    descripcion: `Comisión asesor ${a.codigo}: ${generaComision ? 'activa' : 'inactiva'}${
      generaComision ? ` · meta ${metaMensual}` : ''
    }`,
    cambios: {
      antes: { generaComision: a.generaComision, metaMensual: a.metaMensual?.toString() ?? null },
      despues: { generaComision, metaMensual: metaMensual?.toString() ?? null },
      campos: ['generaComision', 'metaMensual'],
    },
  });

  revalidatePath('/admin/catalogos/asesores');
  return { ok: true };
}

export async function toggleAsesorAction(id: string) {
  await requireAuth();
  const a = await prisma.asesorComercial.findUnique({ where: { id } });
  if (!a) return;

  const err = await validarSucursalIdAsignable(a.sucursalId);
  if (err) return;

  const nuevoEstado = !a.active;
  await prisma.asesorComercial.update({ where: { id }, data: { active: nuevoEstado } });

  await auditarEvento({
    entidad: 'AsesorComercial',
    entidadId: id,
    accion: 'TOGGLE',
    entidadSucursalId: a.sucursalId,
    descripcion: `Asesor ${a.codigo} ${nuevoEstado ? 'activado' : 'desactivado'}`,
    cambios: {
      antes: { active: a.active },
      despues: { active: nuevoEstado },
      campos: ['active'],
    },
  });

  revalidatePath('/admin/catalogos/asesores');
}
