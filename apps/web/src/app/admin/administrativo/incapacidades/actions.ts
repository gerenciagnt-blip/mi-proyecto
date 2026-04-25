'use server';

import { revalidatePath } from 'next/cache';
import type { IncapacidadDocumentoTipo, TipoDocumento } from '@pila/db';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { nextIncapacidadConsecutivo } from '@/lib/incapacidades/consecutivo';
import {
  guardarDocumentoIncapacidad,
  MIMES_PERMITIDOS,
  TAMANO_MAX,
} from '@/lib/incapacidades/storage';
import {
  IncapacidadRadicarSchema,
  IncapacidadDocumentoTipoEnum,
} from '@/lib/incapacidades/validations';
import { emitirNotificacion } from '@/lib/notificaciones';

export type ActionState = { error?: string; ok?: boolean; mensaje?: string };

// ============ Buscar cotizante (para arrastrar datos en el formulario) ============

export type CotizanteIncap = {
  id: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombreCompleto: string;
  sucursalId: string | null;
  /** Afiliación ACTIVA más reciente (si existe). Nullable. */
  afiliacionActiva: {
    id: string;
    fechaIngreso: string; // ISO
    empresaPlanillaId: string | null;
    empresaPlanillaNombre: string | null;
    epsId: string | null;
    epsNombre: string | null;
    afpId: string | null;
    afpNombre: string | null;
    arlId: string | null;
    arlNombre: string | null;
    ccfId: string | null;
    ccfNombre: string | null;
  } | null;
};

/**
 * Busca al cotizante por tipo+número de documento dentro de la sucursal
 * del aliado. Devuelve los datos que el formulario usa para "arrastrar":
 * empresa planilla, entidades SGSS y fecha de afiliación de su
 * afiliación activa más reciente.
 */
export async function buscarCotizanteIncapAction(
  tipoDocumento: string,
  numeroDocumento: string,
): Promise<{ found: CotizanteIncap | null; error?: string }> {
  await requireAuth();
  const scope = await getUserScope();
  if (!scope) return { found: null, error: 'Sesión inválida' };

  const doc = numeroDocumento.trim().toUpperCase();
  if (!doc) return { found: null, error: 'Ingresa un número de documento' };

  // Scope: SUCURSAL sólo ve cotizantes de su sucursal.
  const cotizante = await prisma.cotizante.findFirst({
    where: {
      tipoDocumento: tipoDocumento as TipoDocumento,
      numeroDocumento: doc,
      ...(scope.tipo === 'SUCURSAL' ? { sucursalId: scope.sucursalId } : {}),
    },
    include: {
      afiliaciones: {
        where: { estado: 'ACTIVA' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          empresa: { select: { id: true, nombre: true } },
          eps: { select: { id: true, nombre: true } },
          afp: { select: { id: true, nombre: true } },
          arl: { select: { id: true, nombre: true } },
          ccf: { select: { id: true, nombre: true } },
        },
      },
    },
  });

  if (!cotizante) {
    return {
      found: null,
      error:
        scope.tipo === 'SUCURSAL'
          ? 'Cotizante no encontrado en tu sucursal'
          : 'Cotizante no encontrado',
    };
  }

  const nombreCompleto = [
    cotizante.primerNombre,
    cotizante.segundoNombre,
    cotizante.primerApellido,
    cotizante.segundoApellido,
  ]
    .filter(Boolean)
    .join(' ');

  const af = cotizante.afiliaciones[0] ?? null;

  return {
    found: {
      id: cotizante.id,
      tipoDocumento: cotizante.tipoDocumento,
      numeroDocumento: cotizante.numeroDocumento,
      nombreCompleto,
      sucursalId: cotizante.sucursalId,
      afiliacionActiva: af
        ? {
            id: af.id,
            fechaIngreso: af.fechaIngreso.toISOString().slice(0, 10),
            empresaPlanillaId: af.empresa?.id ?? null,
            empresaPlanillaNombre: af.empresa?.nombre ?? null,
            epsId: af.eps?.id ?? null,
            epsNombre: af.eps?.nombre ?? null,
            afpId: af.afp?.id ?? null,
            afpNombre: af.afp?.nombre ?? null,
            arlId: af.arl?.id ?? null,
            arlNombre: af.arl?.nombre ?? null,
            ccfId: af.ccf?.id ?? null,
            ccfNombre: af.ccf?.nombre ?? null,
          }
        : null,
    },
  };
}

// ============ Radicar incapacidad ============

/**
 * Valida los datos del formulario + archivos, crea la incapacidad con
 * snapshots de la afiliación al momento de radicar, guarda los documentos
 * en UPLOADS_DIR/incapacidades/<id> y registra la primera gestión de
 * la bitácora con estado RADICADA.
 *
 * Los archivos se envían en FormData con nombres `doc.<tipo>` (ej.
 * `doc.COPIA_CEDULA`). El tipo debe estar en el enum `IncapacidadDocumentoTipo`.
 */
export async function radicarIncapacidadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { incapacidadId?: string; consecutivo?: string }> {
  const session = await requireAuth();
  const userId = session.user.id;
  const userName = session.user.name;

  const scope = await getUserScope();
  if (!scope) return { error: 'Sesión inválida' };
  // Los aliados radican en su sucursal; staff también puede radicar a
  // nombre de cualquier sucursal (se toma de la del cotizante).
  const payload = {
    tipo: String(formData.get('tipo') ?? ''),
    tipoDocumento: String(formData.get('tipoDocumento') ?? ''),
    numeroDocumento: String(formData.get('numeroDocumento') ?? '').toUpperCase(),
    fechaInicio: String(formData.get('fechaInicio') ?? ''),
    fechaFin: String(formData.get('fechaFin') ?? ''),
    observaciones: String(formData.get('observaciones') ?? ''),
  };

  const parsed = IncapacidadRadicarSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const d = parsed.data;

  // Match cotizante (con scope si aliado)
  const cotizante = await prisma.cotizante.findFirst({
    where: {
      tipoDocumento: d.tipoDocumento,
      numeroDocumento: d.numeroDocumento,
      ...(scope.tipo === 'SUCURSAL' ? { sucursalId: scope.sucursalId } : {}),
    },
    include: {
      afiliaciones: {
        where: { estado: 'ACTIVA' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!cotizante) {
    return { error: 'Cotizante no encontrado en tu sucursal' };
  }
  if (!cotizante.sucursalId) {
    return {
      error:
        'El cotizante no tiene sucursal asignada; pide al staff que lo reasigne antes de radicar.',
    };
  }

  const af = cotizante.afiliaciones[0] ?? null;

  // Recolectar archivos enviados.
  type ArchivoIn = {
    tipo: IncapacidadDocumentoTipo;
    file: File;
  };
  const archivos: ArchivoIn[] = [];
  for (const key of IncapacidadDocumentoTipoEnum.options) {
    const entry = formData.get(`doc.${key}`);
    if (entry instanceof File && entry.size > 0) {
      archivos.push({ tipo: key, file: entry });
    }
  }

  // Regla operativa: certificado de incapacidad es mínimo indispensable;
  // el resto son deseables pero no obligatorios en esta primera iteración.
  const tieneCertificado = archivos.some((a) => a.tipo === 'CERTIFICADO_INCAPACIDAD');
  if (!tieneCertificado) {
    return { error: 'Debes adjuntar al menos el Certificado de Incapacidad.' };
  }

  for (const a of archivos) {
    if (a.file.size > TAMANO_MAX) {
      return {
        error: `El documento "${a.file.name}" supera los 5 MB permitidos.`,
      };
    }
    if (!MIMES_PERMITIDOS.includes(a.file.type as (typeof MIMES_PERMITIDOS)[number])) {
      return {
        error: `Tipo de archivo no permitido: ${a.file.type || 'desconocido'}. Sólo PDF e imágenes.`,
      };
    }
  }

  // Cálculo de días (ambos extremos inclusivos).
  const dias =
    Math.round((d.fechaFin.getTime() - d.fechaInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const consecutivo = await nextIncapacidadConsecutivo();

  // Creamos la incapacidad primero (necesitamos el id para el path).
  const incapacidad = await prisma.incapacidad.create({
    data: {
      consecutivo,
      sucursalId: cotizante.sucursalId,
      cotizanteId: cotizante.id,
      tipo: d.tipo,
      fechaInicio: d.fechaInicio,
      fechaFin: d.fechaFin,
      diasIncapacidad: dias,
      empresaPlanillaId: af?.empresaId ?? null,
      empresaPlanillaNombreSnap: null, // lo llenamos abajo
      epsId: af?.epsId ?? null,
      afpId: af?.afpId ?? null,
      arlId: af?.arlId ?? null,
      ccfId: af?.ccfId ?? null,
      fechaAfiliacionSnap: af?.fechaIngreso ?? null,
      observaciones: d.observaciones ?? null,
      createdById: userId,
    },
  });

  // Si había empresa, guardamos el nombre denormalizado como snapshot.
  if (af?.empresaId) {
    const emp = await prisma.empresa.findUnique({
      where: { id: af.empresaId },
      select: { nombre: true },
    });
    if (emp) {
      await prisma.incapacidad.update({
        where: { id: incapacidad.id },
        data: { empresaPlanillaNombreSnap: emp.nombre },
      });
    }
  }

  // Guardamos archivos + registros en BD (best-effort: si uno falla
  // dejamos los que sí se guardaron y lo reportamos).
  const fallos: string[] = [];
  for (const a of archivos) {
    try {
      const buf = Buffer.from(await a.file.arrayBuffer());
      const saved = await guardarDocumentoIncapacidad(buf, a.file.name, incapacidad.id);
      await prisma.incapacidadDocumento.create({
        data: {
          incapacidadId: incapacidad.id,
          tipo: a.tipo,
          archivoPath: saved.path,
          archivoHash: saved.hash,
          archivoMime: a.file.type,
          archivoSize: saved.size,
          archivoNombreOriginal: a.file.name,
        },
      });
    } catch (err) {
      fallos.push(`${a.tipo}: ${err instanceof Error ? err.message : 'error desconocido'}`);
    }
  }

  // Primera gestión: registro de radicación.
  await prisma.incapacidadGestion.create({
    data: {
      incapacidadId: incapacidad.id,
      accionadaPor: 'ALIADO',
      nuevoEstado: 'RADICADA',
      descripcion: `Radicación inicial · ${archivos.length} documento(s) adjunto(s).`,
      userId,
      userName,
    },
  });

  // Notificar a SOPORTE: hay un nuevo radicado para procesar.
  void emitirNotificacion({
    tipo: 'SOPORTE_NUEVA_INCAPACIDAD',
    destinoRole: 'SOPORTE',
    titulo: `Nueva incapacidad radicada · ${consecutivo}`,
    mensaje: `${d.tipo.replaceAll('_', ' ').toLowerCase()} · ${dias} día(s) · ${archivos.length} doc(s).`,
    href: `/admin/soporte/incapacidades`,
    metadatos: {
      incapacidadId: incapacidad.id,
      consecutivo,
      sucursalId: cotizante.sucursalId,
    },
  });

  revalidatePath('/admin/administrativo/incapacidades');
  revalidatePath('/admin/soporte/incapacidades');

  const mensaje =
    fallos.length > 0
      ? `Radicada ${consecutivo} con ${archivos.length - fallos.length}/${archivos.length} documentos (revisa fallos: ${fallos.join('; ')})`
      : `Radicada ${consecutivo} con ${archivos.length} documento(s).`;

  return {
    ok: true,
    incapacidadId: incapacidad.id,
    consecutivo,
    mensaje,
  };
}

// ============ Gestión desde el aliado ============

export async function gestionAliadoIncapAction(
  incapacidadId: string,
  descripcion: string,
): Promise<ActionState> {
  const session = await requireAuth();
  const userId = session.user.id;
  const userName = session.user.name;

  const desc = descripcion.trim();
  if (!desc) return { error: 'La descripción es obligatoria' };

  const scope = await getUserScope();
  if (!scope) return { error: 'Sesión inválida' };

  const inc = await prisma.incapacidad.findUnique({
    where: { id: incapacidadId },
    select: { id: true, sucursalId: true },
  });
  if (!inc) return { error: 'Incapacidad no encontrada' };
  if (scope.tipo === 'SUCURSAL' && inc.sucursalId !== scope.sucursalId) {
    return { error: 'No tienes permiso sobre esta incapacidad' };
  }

  await prisma.incapacidadGestion.create({
    data: {
      incapacidadId,
      accionadaPor: 'ALIADO',
      descripcion: desc,
      userId,
      userName,
    },
  });

  revalidatePath('/admin/administrativo/incapacidades');
  revalidatePath('/admin/soporte/incapacidades');
  return { ok: true };
}

// ============ Listar gestiones (timeline compartido) ============

export type IncapGestionRow = {
  id: string;
  accionadaPor: 'SOPORTE' | 'ALIADO';
  nuevoEstado: string | null;
  descripcion: string;
  userName: string | null;
  createdAt: Date;
};

export async function listarGestionesIncapAction(
  incapacidadId: string,
): Promise<IncapGestionRow[]> {
  const { requireAuth } = await import('@/lib/auth-helpers');
  await requireAuth();
  const scope = await getUserScope();
  if (!scope) return [];

  if (scope.tipo === 'SUCURSAL') {
    const inc = await prisma.incapacidad.findUnique({
      where: { id: incapacidadId },
      select: { sucursalId: true },
    });
    if (!inc || inc.sucursalId !== scope.sucursalId) return [];
  }

  const rows = await prisma.incapacidadGestion.findMany({
    where: { incapacidadId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      accionadaPor: true,
      nuevoEstado: true,
      descripcion: true,
      userName: true,
      createdAt: true,
    },
  });
  return rows;
}
