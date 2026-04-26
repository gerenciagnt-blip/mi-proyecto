'use server';

import { revalidatePath } from 'next/cache';
import type { IncapacidadEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { emitirNotificacion } from '@/lib/notificaciones';
import { auditarEvento } from '@/lib/auditoria';

export type ActionState = { error?: string; ok?: boolean };

/**
 * Gestión de Soporte sobre una incapacidad radicada. Puede cambiar de
 * estado (RADICADA → EN_REVISION → APROBADA/PAGADA/RECHAZADA) y registra
 * la descripción en la bitácora. Todas las transiciones son reversibles
 * (no bloqueamos "back-steps" para permitir corregir errores de staff).
 */
export async function gestionSoporteIncapAction(
  incapacidadId: string,
  params: {
    descripcion: string;
    nuevoEstado?: IncapacidadEstado;
  },
): Promise<ActionState> {
  const session = await requireStaff();
  const userId = session.user.id;
  const userName = session.user.name;

  const desc = params.descripcion.trim();
  if (!desc) return { error: 'La descripción es obligatoria' };

  const inc = await prisma.incapacidad.findUnique({
    where: { id: incapacidadId },
    select: {
      id: true,
      estado: true,
      consecutivo: true,
      sucursalId: true,
      cotizante: {
        select: {
          primerNombre: true,
          primerApellido: true,
          numeroDocumento: true,
        },
      },
    },
  });
  if (!inc) return { error: 'Incapacidad no encontrada' };

  const cambio =
    params.nuevoEstado && params.nuevoEstado !== inc.estado ? params.nuevoEstado : undefined;

  await prisma.$transaction(async (tx) => {
    if (cambio) {
      await tx.incapacidad.update({
        where: { id: incapacidadId },
        data: { estado: cambio },
      });
    }
    await tx.incapacidadGestion.create({
      data: {
        incapacidadId,
        accionadaPor: 'SOPORTE',
        nuevoEstado: cambio ?? null,
        descripcion: desc,
        userId,
        userName,
      },
    });
  });

  // Bitácora — solo registramos cambios de estado (las notas sin cambio
  // ya quedan en IncapacidadGestion). Los cambios de estado son los
  // momentos de plata: aprobada/pagada/rechazada determinan si el
  // cotizante recibe o no su incapacidad.
  if (cambio) {
    const labelEstado = cambio.replaceAll('_', ' ').toLowerCase();
    await auditarEvento({
      entidad: 'Incapacidad',
      entidadId: incapacidadId,
      accion: 'GESTIONAR_SOPORTE',
      entidadSucursalId: inc.sucursalId,
      descripcion: `Soporte cambió ${inc.consecutivo} a ${labelEstado} · ${desc.slice(0, 80)}`,
      cambios: {
        antes: { estado: inc.estado },
        despues: { estado: cambio },
        campos: ['estado'],
      },
    });
  }

  // Notificar al aliado dueño/usuario de la sucursal: soporte gestionó
  // su incapacidad. Adjuntamos el contexto del cotizante para que el
  // aliado entienda de qué incapacidad se trata sin abrir el detalle.
  const nombreCot = `${inc.cotizante.primerNombre} ${inc.cotizante.primerApellido}`.trim();
  void emitirNotificacion({
    tipo: 'ALIADO_GESTION_INCAPACIDAD',
    destinoSucursalId: inc.sucursalId,
    titulo: `Soporte gestionó incapacidad · ${inc.consecutivo}`,
    mensaje: `${nombreCot} (${inc.cotizante.numeroDocumento})${
      cambio ? ` · → ${cambio.replaceAll('_', ' ').toLowerCase()}` : ''
    }`,
    href: '/admin/administrativo/incapacidades?tab=historico',
    metadatos: {
      incapacidadId,
      consecutivo: inc.consecutivo,
      nuevoEstado: cambio ?? null,
    },
  });

  revalidatePath('/admin/soporte/incapacidades');
  revalidatePath('/admin/administrativo/incapacidades');
  return { ok: true };
}

/** Elimina una incapacidad junto con sus documentos (cascade). */
export async function anularIncapacidadAction(incapacidadId: string): Promise<ActionState> {
  await requireStaff();
  const inc = await prisma.incapacidad.findUnique({
    where: { id: incapacidadId },
    select: {
      id: true,
      consecutivo: true,
      estado: true,
      sucursalId: true,
      tipo: true,
    },
  });
  if (!inc) return { error: 'Incapacidad no encontrada' };

  await prisma.incapacidad.delete({ where: { id: incapacidadId } });

  await auditarEvento({
    entidad: 'Incapacidad',
    entidadId: incapacidadId,
    accion: 'ANULAR',
    entidadSucursalId: inc.sucursalId,
    descripcion: `Incapacidad ${inc.consecutivo} (${inc.tipo}) eliminada (estaba en ${inc.estado})`,
    cambios: {
      antes: {
        consecutivo: inc.consecutivo,
        estado: inc.estado,
        tipo: inc.tipo,
      },
      despues: {},
      campos: ['consecutivo', 'estado', 'tipo'],
    },
  });

  revalidatePath('/admin/soporte/incapacidades');
  revalidatePath('/admin/administrativo/incapacidades');
  return { ok: true };
}
