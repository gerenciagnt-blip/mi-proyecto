'use server';

/**
 * Server actions del módulo Soporte / Jurídico.
 *
 * Maneja el flujo legal de incapacidades:
 *  - Cualquier STAFF (ADMIN/SOPORTE) ve la bandeja Jurídico y los listados.
 *  - SOLO usuarios con permiso `soporte.juridico_confidencial` pueden:
 *      • Subir documentos marcados como confidenciales.
 *      • Descargar documentos confidenciales (validado en el endpoint
 *        `/api/incapacidades/[id]/documentos/[docId]`).
 *  - Solo el área jurídica decide cuándo cierra el caso (mueve a
 *    APROBADA / PAGADA / RECHAZADA — vuelve al flujo regular).
 *
 * El traslado A jurídico (RADICADA/EN_REVISION → TRASLADO_A_JURIDICO)
 * lo hace cualquier soporte desde la bandeja regular usando la action
 * `gestionSoporteIncapAction` existente en `/admin/soporte/incapacidades`.
 *
 * Las gestiones registradas acá quedan con `accionadaPor='JURIDICO'`
 * en la bitácora `IncapacidadGestion`, distinguiéndolas del flujo normal.
 */

import { revalidatePath } from 'next/cache';
import type { IncapacidadDocumentoTipo, IncapacidadEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { puedeDescargarDocConfidencial } from '@/lib/permisos-runtime';
import { auditarEvento } from '@/lib/auditoria';
import { emitirNotificacion } from '@/lib/notificaciones';
import {
  guardarDocumentoIncapacidad,
  MIMES_PERMITIDOS,
  TAMANO_MAX,
} from '@/lib/incapacidades/storage';
import { IncapacidadDocumentoTipoEnum } from '@/lib/incapacidades/validations';

export type ActionState = { error?: string; ok?: boolean };

/**
 * Estados que el área jurídica PUEDE asignar desde su bandeja.
 *
 * `EN_PROCESO_JURIDICO` — el caso está activo en gestión legal.
 * `APROBADA` / `PAGADA` / `RECHAZADA` — cierre del proceso, vuelve al
 *                                       flujo regular.
 *
 * NO se permite volver a `RADICADA` / `EN_REVISION` desde acá — si el
 * caso debe salir del flujo jurídico, se cierra como APROBADA/RECHAZADA
 * y soporte continúa el proceso si aplica.
 */
const ESTADOS_PERMITIDOS_JURIDICO: ReadonlySet<IncapacidadEstado> = new Set([
  'TRASLADO_A_JURIDICO',
  'EN_PROCESO_JURIDICO',
  'APROBADA',
  'PAGADA',
  'RECHAZADA',
]);

/**
 * Registra una gestión sobre una incapacidad EN flujo jurídico.
 *
 * Reglas:
 *   - El caso debe estar en `TRASLADO_A_JURIDICO` o `EN_PROCESO_JURIDICO`.
 *   - El nuevo estado (si se cambia) debe ser uno de los permitidos.
 *   - La gestión queda con `accionadaPor='JURIDICO'`.
 */
export async function gestionJuridicoIncapAction(
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

  // El caso DEBE estar en flujo jurídico para poder gestionarse desde acá.
  if (inc.estado !== 'TRASLADO_A_JURIDICO' && inc.estado !== 'EN_PROCESO_JURIDICO') {
    return {
      error:
        `El caso no está en flujo jurídico (estado actual: ${inc.estado}). ` +
        'Para retomar, primero traslada a jurídico desde la bandeja de Soporte/Incapacidades.',
    };
  }

  const cambio =
    params.nuevoEstado && params.nuevoEstado !== inc.estado ? params.nuevoEstado : undefined;

  if (cambio && !ESTADOS_PERMITIDOS_JURIDICO.has(cambio)) {
    return {
      error:
        `No se permite cambiar a "${cambio}" desde la bandeja jurídica. ` +
        'Estados válidos: EN_PROCESO_JURIDICO, APROBADA, PAGADA, RECHAZADA.',
    };
  }

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
        accionadaPor: 'JURIDICO',
        nuevoEstado: cambio ?? null,
        descripcion: desc,
        userId,
        userName,
      },
    });
  });

  if (cambio) {
    const labelEstado = cambio.replaceAll('_', ' ').toLowerCase();
    await auditarEvento({
      entidad: 'Incapacidad',
      entidadId: incapacidadId,
      accion: 'GESTIONAR_JURIDICO',
      entidadSucursalId: inc.sucursalId,
      descripcion: `Jurídico cambió ${inc.consecutivo} a ${labelEstado} · ${desc.slice(0, 80)}`,
      cambios: {
        antes: { estado: inc.estado },
        despues: { estado: cambio },
        campos: ['estado'],
      },
    });
  }

  // Notificar al aliado dueño/usuario de la sucursal — pero SIN exponer
  // detalles del proceso legal. Mensaje genérico con cambio de estado.
  // Los detalles solo viven en la bitácora interna (no se manda por
  // notificación push/email).
  const nombreCot = `${inc.cotizante.primerNombre} ${inc.cotizante.primerApellido}`.trim();
  void emitirNotificacion({
    tipo: 'ALIADO_GESTION_INCAPACIDAD',
    destinoSucursalId: inc.sucursalId,
    titulo: `Jurídico actualizó incapacidad · ${inc.consecutivo}`,
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

  revalidatePath('/admin/soporte/juridico');
  revalidatePath(`/admin/soporte/juridico/${incapacidadId}`);
  revalidatePath('/admin/soporte/incapacidades');
  revalidatePath('/admin/administrativo/incapacidades');
  return { ok: true };
}

/**
 * Sube un documento al expediente jurídico de una incapacidad. El
 * documento queda marcado `confidencial=true` automáticamente — solo
 * se descarga por usuarios con permiso `soporte.juridico_confidencial`.
 *
 * Solo usuarios con ese permiso (o ADMIN) pueden invocar esta acción.
 * Los demás staff pueden ver el documento en el listado pero no subirlo
 * ni descargarlo.
 */
export async function subirDocumentoJuridicoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();
  const puede = await puedeDescargarDocConfidencial({
    id: session.user.id,
    role: session.user.role,
    rolCustomId: session.user.rolCustomId,
  });
  if (!puede) {
    return {
      error: 'No tienes permiso para subir documentos confidenciales. Contacta al administrador.',
    };
  }
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
    select: { id: true, sucursalId: true, consecutivo: true, estado: true },
  });
  if (!inc) return { error: 'Incapacidad no encontrada' };

  // Validar que el caso esté en flujo jurídico — los docs confidenciales
  // solo aplican al expediente legal.
  if (inc.estado !== 'TRASLADO_A_JURIDICO' && inc.estado !== 'EN_PROCESO_JURIDICO') {
    return {
      error: 'Solo se pueden subir documentos confidenciales a casos en flujo jurídico.',
    };
  }

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
      accionadaPor: 'JURIDICO',
      confidencial: true,
      userId,
    },
  });

  await auditarEvento({
    entidad: 'Incapacidad',
    entidadId: incapacidadId,
    accion: 'DOCUMENTO_JURIDICO',
    entidadSucursalId: inc.sucursalId,
    descripcion: `Jurídico adjuntó documento confidencial (${tipo}) a ${inc.consecutivo}: ${file.name}`,
    cambios: null,
  });

  revalidatePath(`/admin/soporte/juridico/${incapacidadId}`);
  revalidatePath('/admin/soporte/juridico');
  return { ok: true };
}
