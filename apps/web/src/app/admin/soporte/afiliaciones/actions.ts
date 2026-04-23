'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, prisma, type SoporteAfEstado } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import {
  guardarDocumentoSoporteAf,
  MIMES_PERMITIDOS,
  TAMANO_MAX,
} from '@/lib/soporte-af/storage';

export type ActionState = { error?: string; ok?: boolean };

/**
 * Gestión de Soporte sobre una solicitud SoporteAfiliacion. Puede:
 * - cambiar de estado (EN_PROCESO → PROCESADA/RECHAZADA/NOVEDAD o reabrir)
 * - agregar descripción a la bitácora (obligatoria)
 * - adjuntar documentos (opcional)
 *
 * Todas las transiciones son reversibles (no bloqueamos back-steps) —
 * soporte puede corregir errores sin tener que crear una nueva solicitud.
 */
export async function gestionSoporteAfAction(
  soporteAfId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();
  const userId = session.user.id;
  const userName = session.user.name;

  const descripcion = String(formData.get('descripcion') ?? '').trim();
  if (!descripcion) return { error: 'La descripción es obligatoria' };

  const rawEstado = String(formData.get('nuevoEstado') ?? '').trim();
  const nuevoEstado: SoporteAfEstado | null =
    rawEstado === 'EN_PROCESO' ||
    rawEstado === 'PROCESADA' ||
    rawEstado === 'RECHAZADA' ||
    rawEstado === 'NOVEDAD'
      ? rawEstado
      : null;

  const sol = await prisma.soporteAfiliacion.findUnique({
    where: { id: soporteAfId },
    select: { id: true, estado: true },
  });
  if (!sol) return { error: 'Solicitud no encontrada' };

  const cambio =
    nuevoEstado && nuevoEstado !== sol.estado ? nuevoEstado : undefined;

  // --- Validar y preparar archivos ANTES de abrir la transacción ---
  // (el writeFile ocurre fuera de tx; si falla, abortamos antes)
  const files = formData.getAll('documento').filter((f): f is File => f instanceof File && f.size > 0);
  const preparados: Array<{
    path: string;
    hash: string;
    size: number;
    mime: string;
    originalName: string;
  }> = [];
  for (const f of files) {
    if (!(MIMES_PERMITIDOS as readonly string[]).includes(f.type)) {
      return { error: `Tipo de archivo no permitido: ${f.type}` };
    }
    if (f.size > TAMANO_MAX) {
      return { error: `Archivo demasiado grande (máx 5 MB): ${f.name}` };
    }
    const buf = Buffer.from(await f.arrayBuffer());
    const saved = await guardarDocumentoSoporteAf(buf, f.name, soporteAfId);
    preparados.push({
      path: saved.path,
      hash: saved.hash,
      size: saved.size,
      mime: f.type,
      originalName: f.name,
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (cambio) {
        await tx.soporteAfiliacion.update({
          where: { id: soporteAfId },
          data: {
            estado: cambio,
            estadoObservaciones: descripcion,
            gestionadoPorId: userId,
            gestionadoEn: new Date(),
          },
        });
      } else {
        // Sin cambio de estado pero sí con observación — la actualizamos.
        await tx.soporteAfiliacion.update({
          where: { id: soporteAfId },
          data: {
            estadoObservaciones: descripcion,
            gestionadoPorId: userId,
            gestionadoEn: new Date(),
          },
        });
      }

      await tx.soporteAfGestion.create({
        data: {
          soporteAfId,
          accionadaPor: 'SOPORTE',
          nuevoEstado: cambio ?? null,
          descripcion,
          userId,
          userName,
        },
      });

      if (preparados.length > 0) {
        await tx.soporteAfDocumento.createMany({
          data: preparados.map((p) => ({
            soporteAfId,
            accionadaPor: 'SOPORTE' as const,
            archivoPath: p.path,
            archivoHash: p.hash,
            archivoMime: p.mime,
            archivoSize: p.size,
            archivoNombreOriginal: p.originalName,
            userId,
          })),
        });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return { error: `Error al guardar (${e.code})` };
    }
    return { error: 'Error al guardar la gestión' };
  }

  revalidatePath('/admin/soporte/afiliaciones');
  revalidatePath(`/admin/soporte/afiliaciones/${soporteAfId}`);
  revalidatePath('/admin/base-datos');
  return { ok: true };
}
