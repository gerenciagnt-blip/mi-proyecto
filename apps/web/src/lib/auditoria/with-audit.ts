import type { Diff } from './diff';
import { prepararPayload, type AuditoriaOpts } from './payload';
import { registrarAuditoria } from './registrar';

/**
 * Wrappers públicos para registrar eventos de bitácora. La lógica que
 * decide qué se registra (filtros de sensibles, diff, descripción por
 * defecto) vive en `payload.ts` y es testeable de forma aislada.
 */

export async function auditarCreate(
  opts: AuditoriaOpts & {
    despues: Record<string, unknown>;
    camposPermitidos?: string[];
  },
): Promise<void> {
  const payload = prepararPayload('CREAR', opts);
  if (!payload) return;
  await registrarAuditoria(payload);
}

export async function auditarUpdate(
  opts: AuditoriaOpts & {
    antes: Record<string, unknown>;
    despues: Record<string, unknown>;
    camposPermitidos?: string[];
  },
): Promise<void> {
  const payload = prepararPayload('EDITAR', opts);
  if (!payload) return;
  await registrarAuditoria(payload);
}

export async function auditarDelete(
  opts: AuditoriaOpts & {
    antes: Record<string, unknown>;
    camposPermitidos?: string[];
  },
): Promise<void> {
  const payload = prepararPayload('ELIMINAR', opts);
  if (!payload) return;
  await registrarAuditoria(payload);
}

/**
 * Versión "evento libre" — para acciones que no encajan en CRUD pero
 * vale la pena registrar (ej. "anular comprobante", "marcar planilla
 * como pagada"). El caller pasa el diff (opcional) y la descripción.
 */
export async function auditarEvento(opts: {
  entidad: string;
  entidadId: string;
  accion: string;
  entidadSucursalId?: string | null;
  descripcion: string;
  cambios?: Diff | null;
}): Promise<void> {
  await registrarAuditoria({
    entidad: opts.entidad,
    entidadId: opts.entidadId,
    accion: opts.accion,
    entidadSucursalId: opts.entidadSucursalId ?? null,
    descripcion: opts.descripcion,
    cambios: opts.cambios ?? null,
  });
}

export type { AuditoriaOpts };
