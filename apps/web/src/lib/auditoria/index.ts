/**
 * API pública del módulo de auditoría.
 *
 * Uso típico desde una server action:
 *
 *     import { auditarUpdate } from '@/lib/auditoria';
 *
 *     export async function actualizarCotizante(id, data) {
 *       const antes = await prisma.cotizante.findUniqueOrThrow({ where: { id } });
 *       const despues = await prisma.cotizante.update({ where: { id }, data });
 *       await auditarUpdate({
 *         entidad: 'Cotizante',
 *         entidadId: id,
 *         entidadSucursalId: despues.sucursalId,
 *         antes,
 *         despues,
 *       });
 *       return { ok: true };
 *     }
 *
 * Para CRUD estándar usar `auditarCreate` / `auditarUpdate` / `auditarDelete`.
 * Para acciones de negocio (anular, marcar como pagada, etc.) usar
 * `auditarEvento`.
 */
export { auditarCreate, auditarUpdate, auditarDelete, auditarEvento } from './with-audit';
export type { AuditoriaOpts } from './with-audit';
export { registrarAuditoria } from './registrar';
export type { RegistrarAuditoriaInput } from './registrar';
export { calcularDiff } from './diff';
export type { Diff } from './diff';
