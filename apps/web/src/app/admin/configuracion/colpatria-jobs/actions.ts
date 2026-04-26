'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireRole } from '@/lib/auth-helpers';
import { auditarEvento } from '@/lib/auditoria';

export type ActionState = { error?: string; ok?: boolean };

/**
 * Reintenta un job fallido o atascado. Crea un job NUEVO con el mismo
 * payload (no modifica el original — los originales quedan como
 * histórico). Solo STAFF.
 *
 * Reglas:
 *   - El job fuente debe estar en FAILED o RETRYABLE.
 *   - El nuevo job nace con `intento = fuente.intento + 1`.
 *   - Si la afiliación ya tiene otro PENDING o RUNNING, NO se reintenta
 *     (evita duplicar).
 */
export async function reintentarJobAction(jobId: string): Promise<ActionState> {
  await requireRole('ADMIN', 'SOPORTE');

  const fuente = await prisma.colpatriaAfiliacionJob.findUnique({
    where: { id: jobId },
  });
  if (!fuente) return { error: 'Job no encontrado' };
  if (fuente.status !== 'FAILED' && fuente.status !== 'RETRYABLE') {
    return { error: 'Solo se reintentan jobs FAILED o RETRYABLE' };
  }

  // Evitar duplicados — si ya hay PENDING/RUNNING para la misma
  // afiliación, salimos.
  const existePendiente = await prisma.colpatriaAfiliacionJob.findFirst({
    where: {
      afiliacionId: fuente.afiliacionId,
      status: { in: ['PENDING', 'RUNNING'] },
    },
    select: { id: true },
  });
  if (existePendiente) {
    return {
      error: 'Ya hay un job pendiente para esta afiliación, no se duplica',
    };
  }

  const nuevo = await prisma.colpatriaAfiliacionJob.create({
    data: {
      afiliacionId: fuente.afiliacionId,
      empresaId: fuente.empresaId,
      status: 'PENDING',
      intento: fuente.intento + 1,
      payload: fuente.payload as object,
    },
    select: { id: true },
  });

  await auditarEvento({
    entidad: 'ColpatriaAfiliacionJob',
    entidadId: nuevo.id,
    accion: 'REINTENTAR',
    descripcion: `Reintento manual del job ${fuente.id} (intento ${fuente.intento + 1})`,
  });

  revalidatePath('/admin/configuracion/colpatria-jobs');
  return { ok: true };
}

/**
 * Marca un job como FAILED definitivo (lo "cierra" sin reintento). Útil
 * para jobs RETRYABLE que ya no tiene sentido reintentar (afiliación
 * cancelada, datos cambiaron, etc.).
 */
export async function cerrarJobAction(jobId: string, motivo: string): Promise<ActionState> {
  await requireRole('ADMIN', 'SOPORTE');

  const m = motivo.trim();
  if (!m) return { error: 'El motivo es obligatorio' };

  const job = await prisma.colpatriaAfiliacionJob.findUnique({ where: { id: jobId } });
  if (!job) return { error: 'Job no encontrado' };
  if (job.status === 'SUCCESS') return { error: 'Job ya está en SUCCESS' };

  await prisma.colpatriaAfiliacionJob.update({
    where: { id: jobId },
    data: {
      status: 'FAILED',
      finishedAt: new Date(),
      error: `Cerrado manualmente: ${m}`,
    },
  });

  await auditarEvento({
    entidad: 'ColpatriaAfiliacionJob',
    entidadId: jobId,
    accion: 'CERRAR',
    descripcion: `Job cerrado manualmente · ${m.slice(0, 100)}`,
  });

  revalidatePath('/admin/configuracion/colpatria-jobs');
  return { ok: true };
}
