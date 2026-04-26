import { headers } from 'next/headers';
import { prisma, Prisma } from '@pila/db';
import type { Role } from '@pila/db';
import { auth } from '@/auth';
import { calcularDiff, type Diff } from './diff';

/**
 * Registra un evento en la bitácora.
 *
 * El actor (usuario que hizo el cambio) y la IP se infieren automáticamente
 * desde la sesión NextAuth y los headers de Next. Si no hay sesión activa
 * (ej. job en background, cron), `userId` queda null pero el evento se
 * registra igual.
 *
 * Esta función es la "primitiva" — el helper más alto `withAudit()` (Sprint
 * 6.2) la usa internamente y se encarga de calcular el diff. Aquí dejamos
 * abierta la posibilidad de llamarla directamente cuando se necesite
 * registrar algo que no encaja en el patrón "antes/después" — ej. un
 * evento de error o una acción manual del staff.
 *
 * Nunca tira excepciones: cualquier fallo (ej. BD caída, sesión corrupta)
 * se loguea como warning y se traga. La filosofía es que un fallo en la
 * bitácora no debe romper la operación que el usuario estaba intentando
 * completar.
 */

export type RegistrarAuditoriaInput = {
  /** Modelo afectado, ej. "Cotizante", "Empresa", "Planilla". */
  entidad: string;
  /** Id de la fila afectada. */
  entidadId: string;
  /** Acción semántica. Strings ya en uso: CREAR, EDITAR, ELIMINAR, TOGGLE. */
  accion: string;
  /** Sucursal a la que pertenece la entidad afectada (si aplica). Sirve
   *  para que un ALIADO_OWNER vea solo eventos de su sucursal. Null si la
   *  entidad es global (catálogos, asesores globales, empresas planilla). */
  entidadSucursalId?: string | null;
  /** Resumen humano corto para mostrar en la lista sin abrir el modal.
   *  Ej.: "Cambió estado a APROBADA", "Reasignó a sucursal ALI-002". */
  descripcion?: string;
  /** Diff estructurado (calculado con `calcularDiff` o pasado a mano). */
  cambios?: Diff | null;
};

export async function registrarAuditoria(input: RegistrarAuditoriaInput): Promise<void> {
  try {
    // Captura del actor desde la sesión NextAuth.
    const session = await auth();
    let userId: string | null = null;
    let userName: string | null = null;
    let userRole: Role | null = null;
    let userSucursalId: string | null = null;

    if (session?.user) {
      userId = session.user.id;
      userName = session.user.name ?? null;
      userRole = session.user.role;
      userSucursalId = session.user.sucursalId ?? null;
    }

    // IP best-effort: detrás de un proxy típicamente viene en x-forwarded-for.
    let ip: string | null = null;
    try {
      const h = await headers();
      const xff = h.get('x-forwarded-for');
      if (xff) {
        // x-forwarded-for puede ser "client, proxy1, proxy2" — el primero
        // es el cliente original.
        ip = xff.split(',')[0]?.trim() ?? null;
      } else {
        ip = h.get('x-real-ip') ?? null;
      }
    } catch {
      // headers() puede fallar fuera de un request context (ej. cron).
      ip = null;
    }

    // El campo Json de Prisma acepta cualquier estructura serializable.
    // Convertimos el Diff a un objeto plano antes de guardarlo. El cast a
    // InputJsonValue es seguro porque `Diff` ya garantiza que solo tiene
    // primitivos / objetos planos / arrays.
    const cambiosJson: Prisma.InputJsonValue | undefined = input.cambios
      ? ({
          antes: input.cambios.antes,
          despues: input.cambios.despues,
          campos: input.cambios.campos,
        } as Prisma.InputJsonValue)
      : undefined;

    await prisma.auditLog.create({
      data: {
        entidad: input.entidad,
        entidadId: input.entidadId,
        accion: input.accion,
        userId,
        userName,
        userRole,
        userSucursalId,
        entidadSucursalId: input.entidadSucursalId ?? null,
        ip,
        descripcion: input.descripcion ?? null,
        cambios: cambiosJson,
      },
    });
  } catch (err) {
    // No queremos que un fallo en la bitácora rompa la operación principal.
    // Log a stderr (Pino lo capturará si está configurado).
    console.error('[auditoria] registrarAuditoria falló:', err);
  }
}

// Re-export para que `withAudit` y los callers tengan todo en un solo import.
export { calcularDiff } from './diff';
export type { Diff } from './diff';
