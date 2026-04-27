'use server';

import { revalidatePath } from 'next/cache';
import type { IncapacidadDocumentoTipo, IncapacidadEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { emitirNotificacion } from '@/lib/notificaciones';
import { auditarEvento } from '@/lib/auditoria';
import {
  guardarDocumentoIncapacidad,
  MIMES_PERMITIDOS,
  TAMANO_MAX,
} from '@/lib/incapacidades/storage';
import { IncapacidadDocumentoTipoEnum } from '@/lib/incapacidades/validations';

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

/**
 * Sprint Soporte reorg fase 2 — Soporte sube un documento a una
 * incapacidad ya radicada.
 *
 * Casos típicos: resolución EPS de aprobación/rechazo, comprobante de
 * pago, autorización del médico tratante. Antes esto solo era posible
 * desde el módulo de finanzas (movimientos-incapacidades), lo cual era
 * confuso operativamente.
 *
 * El registro queda con `accionadaPor='SOPORTE'` y `userId=actor` para
 * diferenciarlo de los soportes que subió el aliado al radicar.
 */
export async function subirDocumentoSoporteIncapAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();
  const userId = session.user.id;

  const incapacidadId = String(formData.get('incapacidadId') ?? '').trim();
  const tipoRaw = String(formData.get('tipo') ?? '').trim();
  if (!incapacidadId) return { error: 'Incapacidad no especificada' };

  const tipoParsed = IncapacidadDocumentoTipoEnum.safeParse(tipoRaw);
  if (!tipoParsed.success) {
    return { error: 'Tipo de documento inválido' };
  }
  const tipo = tipoParsed.data as IncapacidadDocumentoTipo;

  const file = formData.get('archivo');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecciona un archivo' };
  }
  if (!(MIMES_PERMITIDOS as readonly string[]).includes(file.type)) {
    return { error: `Tipo de archivo no permitido: ${file.type}` };
  }
  if (file.size > TAMANO_MAX) {
    return { error: 'Archivo demasiado grande (máx 5 MB)' };
  }

  const inc = await prisma.incapacidad.findUnique({
    where: { id: incapacidadId },
    select: { id: true, sucursalId: true, consecutivo: true },
  });
  if (!inc) return { error: 'Incapacidad no encontrada' };

  const buf = Buffer.from(await file.arrayBuffer());
  const saved = await guardarDocumentoIncapacidad(buf, file.name, incapacidadId);

  await prisma.incapacidadDocumento.create({
    data: {
      incapacidadId,
      tipo,
      archivoPath: saved.path,
      archivoHash: saved.hash,
      archivoMime: file.type,
      archivoSize: saved.size,
      archivoNombreOriginal: file.name,
      accionadaPor: 'SOPORTE',
      userId,
    },
  });

  await auditarEvento({
    entidad: 'Incapacidad',
    entidadId: incapacidadId,
    accion: 'DOCUMENTO_SOPORTE',
    entidadSucursalId: inc.sucursalId,
    descripcion: `Soporte adjuntó documento (${tipo}) a ${inc.consecutivo}: ${file.name}`,
    cambios: null,
  });

  revalidatePath(`/admin/soporte/incapacidades/${incapacidadId}`);
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
