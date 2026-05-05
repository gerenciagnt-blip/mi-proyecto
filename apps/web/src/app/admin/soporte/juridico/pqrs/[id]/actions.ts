'use server';

/**
 * Server actions admin del módulo PQRS (Soporte/Jurídico).
 *
 * Reglas:
 *  - Visible/gestionable por TODO STAFF (ADMIN/SOPORTE).
 *  - Toda gestión queda en bitácora `PqrsGestion` con userId/userName.
 *  - Al marcar como RESPONDIDA se notifica al solicitante (email + WA stub).
 *  - Al cerrar (CERRADA / RECHAZADA) se setea `cerradaEn`.
 */

import { revalidatePath } from 'next/cache';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { PqrsEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { auditarEvento } from '@/lib/auditoria';
import { createLogger } from '@/lib/logger';
import { notificarRespuestaAlSolicitante } from '@/lib/pqrs/notificaciones';

const log = createLogger('pqrs-admin');

export type ActionState = { error?: string; ok?: boolean };

const MAX_DOC_SIZE_BYTES = 5 * 1024 * 1024;
const MIMES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ESTADOS_VALIDOS: ReadonlySet<PqrsEstado> = new Set([
  'RECIBIDA',
  'EN_TRAMITE',
  'RESPONDIDA',
  'CERRADA',
  'RECHAZADA',
]);

// ─────────────────────────────────────────────────────────────────────
// Cambiar estado / agregar nota interna
// ─────────────────────────────────────────────────────────────────────

const GestionSchema = z.object({
  pqrsId: z.string().min(1),
  descripcion: z.string().trim().min(3, 'Descripción muy corta').max(2000),
  nuevoEstado: z.string().optional(),
});

export async function gestionPqrsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();
  const userId = session.user.id;
  const userName = session.user.name;

  const parsed = GestionSchema.safeParse({
    pqrsId: String(formData.get('pqrsId') ?? ''),
    descripcion: String(formData.get('descripcion') ?? ''),
    nuevoEstado: String(formData.get('nuevoEstado') ?? '') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { pqrsId, descripcion } = parsed.data;
  const nuevoEstadoRaw = parsed.data.nuevoEstado;

  const pqrs = await prisma.pqrs.findUnique({
    where: { id: pqrsId },
    select: { id: true, consecutivo: true, estado: true, tipo: true },
  });
  if (!pqrs) return { error: 'PQRS no encontrada' };

  let nuevoEstado: PqrsEstado | undefined;
  if (nuevoEstadoRaw && ESTADOS_VALIDOS.has(nuevoEstadoRaw as PqrsEstado)) {
    const e = nuevoEstadoRaw as PqrsEstado;
    if (e !== pqrs.estado) nuevoEstado = e;
  }

  await prisma.$transaction(async (tx) => {
    if (nuevoEstado) {
      const dataUpdate: { estado: PqrsEstado; cerradaEn?: Date } = { estado: nuevoEstado };
      if (nuevoEstado === 'CERRADA' || nuevoEstado === 'RECHAZADA') {
        dataUpdate.cerradaEn = new Date();
      }
      await tx.pqrs.update({ where: { id: pqrsId }, data: dataUpdate });
    }
    await tx.pqrsGestion.create({
      data: {
        pqrsId,
        descripcion,
        nuevoEstado: nuevoEstado ?? null,
        userId,
        userName,
      },
    });
  });

  if (nuevoEstado) {
    await auditarEvento({
      entidad: 'Pqrs',
      entidadId: pqrsId,
      accion: 'GESTIONAR_PQRS',
      descripcion: `PQRS ${pqrs.consecutivo} → ${nuevoEstado.toLowerCase().replaceAll('_', ' ')} · ${descripcion.slice(0, 80)}`,
      cambios: {
        antes: { estado: pqrs.estado },
        despues: { estado: nuevoEstado },
        campos: ['estado'],
      },
    });
  }

  revalidatePath('/admin/soporte/juridico');
  revalidatePath(`/admin/soporte/juridico/pqrs/${pqrsId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Responder PQRS — escribe respuesta formal y notifica al solicitante
// ─────────────────────────────────────────────────────────────────────

const ResponderSchema = z.object({
  pqrsId: z.string().min(1),
  respuesta: z.string().trim().min(20, 'Respuesta muy corta (mín. 20 caracteres)').max(10000),
  marcarComoCerrada: z.boolean().optional(),
});

export async function responderPqrsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();
  const userId = session.user.id;
  const userName = session.user.name;

  const parsed = ResponderSchema.safeParse({
    pqrsId: String(formData.get('pqrsId') ?? ''),
    respuesta: String(formData.get('respuesta') ?? ''),
    marcarComoCerrada: formData.get('marcarComoCerrada') === 'on',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { pqrsId, respuesta, marcarComoCerrada } = parsed.data;

  const pqrs = await prisma.pqrs.findUnique({
    where: { id: pqrsId },
    select: {
      id: true,
      consecutivo: true,
      estado: true,
      asunto: true,
      email: true,
      telefono: true,
      nombres: true,
    },
  });
  if (!pqrs) return { error: 'PQRS no encontrada' };

  if (pqrs.estado === 'CERRADA' || pqrs.estado === 'RECHAZADA') {
    return { error: 'La PQRS ya está cerrada — no se pueden registrar más respuestas.' };
  }

  const nuevoEstado: PqrsEstado = marcarComoCerrada ? 'CERRADA' : 'RESPONDIDA';
  const ahora = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.pqrs.update({
      where: { id: pqrsId },
      data: {
        respuesta,
        respondidoById: userId,
        respondidaEn: ahora,
        estado: nuevoEstado,
        cerradaEn: marcarComoCerrada ? ahora : null,
      },
    });
    await tx.pqrsGestion.create({
      data: {
        pqrsId,
        descripcion:
          (marcarComoCerrada
            ? 'Respuesta enviada y caso cerrado'
            : 'Respuesta enviada al solicitante') +
          `: ${respuesta.slice(0, 200)}${respuesta.length > 200 ? '…' : ''}`,
        nuevoEstado,
        userId,
        userName,
      },
    });
  });

  await auditarEvento({
    entidad: 'Pqrs',
    entidadId: pqrsId,
    accion: 'RESPONDER_PQRS',
    descripcion: `PQRS ${pqrs.consecutivo} respondida (${nuevoEstado.toLowerCase()}) por ${userName}`,
    cambios: {
      antes: { estado: pqrs.estado },
      despues: { estado: nuevoEstado, respondidaEn: ahora.toISOString() },
      campos: ['estado', 'respuesta'],
    },
  });

  // Notificar al solicitante — fire-and-forget (no bloquea la respuesta).
  void notificarRespuestaAlSolicitante({
    id: pqrs.id,
    consecutivo: pqrs.consecutivo,
    email: pqrs.email,
    telefono: pqrs.telefono,
    nombres: pqrs.nombres,
    asunto: pqrs.asunto,
    respuesta,
  }).catch((err) =>
    log.error({ err: String(err), pqrsId }, 'Notificar respuesta al solicitante falló'),
  );

  revalidatePath('/admin/soporte/juridico');
  revalidatePath(`/admin/soporte/juridico/pqrs/${pqrsId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Subir documento adjunto desde admin
// ─────────────────────────────────────────────────────────────────────

export async function subirDocumentoPqrsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();
  const userId = session.user.id;
  const userName = session.user.name;

  const pqrsId = String(formData.get('pqrsId') ?? '').trim();
  if (!pqrsId) return { error: 'PQRS no especificada' };

  const file = formData.get('archivo');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecciona un archivo' };
  }
  if (!(MIMES_PERMITIDOS as readonly string[]).includes(file.type)) {
    return { error: `Tipo de archivo no permitido: ${file.type}` };
  }
  if (file.size > MAX_DOC_SIZE_BYTES) {
    return { error: 'Archivo demasiado grande (máx 5 MB)' };
  }

  const pqrs = await prisma.pqrs.findUnique({
    where: { id: pqrsId },
    select: { id: true, consecutivo: true },
  });
  if (!pqrs) return { error: 'PQRS no encontrada' };

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = createHash('sha256').update(buffer).digest('hex');

  const uploadsDir = process.env.UPLOADS_DIR ?? './uploads';
  const pqrsDir = resolve(uploadsDir, 'pqrs', pqrs.id);
  if (!existsSync(pqrsDir)) {
    mkdirSync(pqrsDir, { recursive: true });
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const filename = `${randomBytes(6).toString('hex')}-${safeName}`;
  const fullPath = join(pqrsDir, filename);
  writeFileSync(fullPath, buffer);

  await prisma.$transaction(async (tx) => {
    await tx.pqrsDocumento.create({
      data: {
        pqrsId,
        archivoPath: `pqrs/${pqrs.id}/${filename}`,
        archivoHash: hash,
        archivoMime: file.type,
        archivoSize: file.size,
        archivoNombreOriginal: file.name.slice(0, 200),
        origen: 'ADMIN',
        userId,
      },
    });
    await tx.pqrsGestion.create({
      data: {
        pqrsId,
        descripcion: `Documento adjuntado por staff: ${file.name}`,
        userId,
        userName,
      },
    });
  });

  await auditarEvento({
    entidad: 'Pqrs',
    entidadId: pqrsId,
    accion: 'DOCUMENTO_PQRS',
    descripcion: `Doc adjuntado a ${pqrs.consecutivo} por ${userName}: ${file.name}`,
    cambios: null,
  });

  revalidatePath(`/admin/soporte/juridico/pqrs/${pqrsId}`);
  return { ok: true };
}
