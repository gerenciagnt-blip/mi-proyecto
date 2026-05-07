'use server';

import { revalidatePath } from 'next/cache';
import { ReporteATCausa, ReporteATDocumentoTipo, ReporteATEstado, prisma } from '@pila/db';
import { requireAuth, requirePermiso } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { puedeAccederModulo } from '@/lib/permisos-runtime';
import { nextReporteAtConsecutivo } from '@/lib/reporte-at/consecutivo';
import {
  crearReporteAtSchema,
  diaSemanaEs,
  ESTADOS_REPORTE_AT,
  type PartesCuerpoItem,
  type ReporteATEstadoLit,
} from '@/lib/reporte-at/validations';
import {
  guardarDocumentoReporteAt,
  MIMES_PERMITIDOS_REPORTE_AT,
  TAMANO_MAX_REPORTE_AT,
} from '@/lib/reporte-at/storage';
import { auditarCreate, auditarUpdate } from '@/lib/auditoria';

export type ActionState = {
  error?: string;
  ok?: boolean;
  mensaje?: string;
  reporteId?: string;
  consecutivo?: string;
};

// ============ Buscar cotizante (auto-arrastre del formulario) ============

/**
 * Datos que arrastra el formulario al hallar el cotizante por tipo+nº doc
 * dentro de la sucursal del aliado. El formulario sigue siendo editable —
 * estos son sólo defaults pre-cargados, el aliado puede ajustarlos.
 */
export type CotizanteReporteAt = {
  cotizanteId: string;
  nombreCompleto: string;
  edad: number | null;
  estadoCivil: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudadResidencia: string | null;
  /** Datos derivados de la afiliación ACTIVA más reciente (si existe). */
  cargo: string | null;
  eps: string | null;
  fondoPension: string | null;
  empresaRazonSocial: string | null;
  empresaNit: string | null;
};

function calcularEdad(fechaNacimiento: Date): number {
  const hoy = new Date();
  let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
  const m = hoy.getMonth() - fechaNacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fechaNacimiento.getDate())) edad--;
  return edad;
}

/**
 * Busca un cotizante en la sucursal del usuario por tipoDoc+nº doc y
 * devuelve los campos que el formulario de Reporte AT puede pre-llenar.
 * Sólo soporta tipos del catálogo Cotizante (CC, CE, TI). Para PEP/PPT
 * el aliado tiene que diligenciar manualmente.
 */
export async function buscarCotizanteReporteAtAction(
  tipoDocumento: string,
  numeroDocumento: string,
): Promise<{ found: CotizanteReporteAt | null; error?: string }> {
  await requireAuth();
  const scope = await getUserScope();
  if (!scope) return { found: null, error: 'Sesión inválida' };

  const doc = numeroDocumento.trim().toUpperCase();
  if (!doc) return { found: null, error: 'Ingresa un número de documento' };

  // Sólo CC/CE/TI están en el enum global TipoDocumento del Cotizante.
  if (!['CC', 'CE', 'TI'].includes(tipoDocumento)) {
    return {
      found: null,
      error: `El tipo "${tipoDocumento}" no se puede buscar; diligencia los datos manualmente.`,
    };
  }

  const cotizante = await prisma.cotizante.findFirst({
    where: {
      tipoDocumento: tipoDocumento as 'CC' | 'CE' | 'TI',
      numeroDocumento: doc,
      ...(scope.tipo === 'SUCURSAL' ? { sucursalId: scope.sucursalId } : {}),
    },
    include: {
      municipio: { select: { nombre: true } },
      afiliaciones: {
        where: { estado: 'ACTIVA' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          empresa: { select: { nombre: true, nit: true } },
          eps: { select: { nombre: true } },
          afp: { select: { nombre: true } },
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
      cotizanteId: cotizante.id,
      nombreCompleto,
      edad: calcularEdad(cotizante.fechaNacimiento),
      estadoCivil: cotizante.estadoCivil ?? null,
      telefono: cotizante.celular ?? cotizante.telefono ?? null,
      direccion: cotizante.direccion ?? null,
      ciudadResidencia: cotizante.municipio?.nombre ?? null,
      cargo: af?.cargo ?? null,
      eps: af?.eps?.nombre ?? null,
      fondoPension: af?.afp?.nombre ?? null,
      empresaRazonSocial: af?.empresa?.nombre ?? null,
      empresaNit: af?.empresa?.nit ?? null,
    },
  };
}

/**
 * Helper: lee `partesCuerpo` que el form envía como JSON string en un
 * único input hidden (evita arrays de FormData). Devuelve [] si está vacío
 * o malformado — la validación zod después rechaza arrays vacíos.
 */
function parsePartesCuerpo(raw: string): PartesCuerpoItem[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

/**
 * Helper: lee causas marcadas (vienen como múltiples campos `causas`
 * en el FormData con valor del enum).
 */
function parseCausas(values: string[]): ReporteATCausa[] {
  const set = new Set(Object.values(ReporteATCausa));
  return values.filter((v): v is ReporteATCausa => set.has(v as ReporteATCausa));
}

// ============ Radicar (Aliado / Administrativo) ============

/**
 * Crea un reporte AT con los datos del formulario. Asigna sucursalId
 * según scope: aliado lo crea en la suya; staff puede asignarla por
 * `sucursalId` del payload (si llega del select de soporte).
 */
export async function radicarReporteAtAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAuth();
  const userId = session.user.id;
  const userName = session.user.name;

  const scope = await getUserScope();
  if (!scope) return { error: 'Sesión inválida' };

  // El aliado debe tener permiso `admin.reporte_at`. Staff puede radicar
  // a nombre del aliado siempre que el módulo de soporte esté activo.
  const moduloRequerido = scope.tipo === 'STAFF' ? 'soporte.reporte_at' : 'admin.reporte_at';
  const ok = await puedeAccederModulo(
    { id: session.user.id, role: session.user.role, rolCustomId: session.user.rolCustomId },
    moduloRequerido,
  );
  if (!ok) return { error: 'No tienes permiso sobre el módulo Reporte AT' };

  // Sucursal destino: aliado siempre la suya; staff puede recibirla del
  // form para registrar a nombre de cualquier sucursal.
  const sucursalIdRaw = String(formData.get('sucursalId') ?? '').trim();
  const sucursalIdDestino = scope.tipo === 'SUCURSAL' ? scope.sucursalId : sucursalIdRaw || null;
  if (!sucursalIdDestino) {
    return { error: 'Selecciona la sucursal a la que pertenece el reporte' };
  }

  const causas = parseCausas(formData.getAll('causas').map(String));
  const partesCuerpo = parsePartesCuerpo(String(formData.get('partesCuerpo') ?? ''));

  const payload = {
    sucursalId: sucursalIdDestino,

    fechaAccidente: String(formData.get('fechaAccidente') ?? ''),
    horaAccidente: String(formData.get('horaAccidente') ?? ''),
    horaInicioJornada: String(formData.get('horaInicioJornada') ?? ''),
    lugar: String(formData.get('lugar') ?? ''),
    ciudadAccidente: String(formData.get('ciudadAccidente') ?? ''),
    departamentoAccidente: String(formData.get('departamentoAccidente') ?? ''),

    trabajadorNombre: String(formData.get('trabajadorNombre') ?? ''),
    trabajadorTipoDoc: String(formData.get('trabajadorTipoDoc') ?? ''),
    trabajadorNumeroDoc: String(formData.get('trabajadorNumeroDoc') ?? '').toUpperCase(),
    trabajadorFondoPension: String(formData.get('trabajadorFondoPension') ?? ''),
    trabajadorEps: String(formData.get('trabajadorEps') ?? ''),
    trabajadorCargo: String(formData.get('trabajadorCargo') ?? ''),
    trabajadorExperienciaMeses: formData.get('trabajadorExperienciaMeses')
      ? Number(formData.get('trabajadorExperienciaMeses'))
      : null,
    trabajadorTelefono: String(formData.get('trabajadorTelefono') ?? ''),
    trabajadorDireccion: String(formData.get('trabajadorDireccion') ?? ''),
    trabajadorCiudadResidencia: String(formData.get('trabajadorCiudadResidencia') ?? ''),
    trabajadorEstadoCivil: String(formData.get('trabajadorEstadoCivil') ?? ''),
    trabajadorEdad: formData.get('trabajadorEdad') ? Number(formData.get('trabajadorEdad')) : null,

    empresaRazonSocial: String(formData.get('empresaRazonSocial') ?? ''),
    empresaNit: String(formData.get('empresaNit') ?? ''),

    hechosQueOcurrio: String(formData.get('hechosQueOcurrio') ?? ''),
    hechosCuandoDonde: String(formData.get('hechosCuandoDonde') ?? ''),
    hechosComoOcurrio: String(formData.get('hechosComoOcurrio') ?? ''),

    causas,
    causasOtros: String(formData.get('causasOtros') ?? ''),

    partesCuerpo,

    responsableNombre: String(formData.get('responsableNombre') ?? ''),
    responsableTelefono: String(formData.get('responsableTelefono') ?? ''),
    responsableCorreo: String(formData.get('responsableCorreo') ?? ''),

    responsable2Nombre: String(formData.get('responsable2Nombre') ?? ''),
    responsable2Telefono: String(formData.get('responsable2Telefono') ?? ''),
    responsable2Correo: String(formData.get('responsable2Correo') ?? ''),

    trabajadorCorreoFirma: String(formData.get('trabajadorCorreoFirma') ?? ''),

    fechaElaboracion: String(formData.get('fechaElaboracion') ?? ''),
  };

  const parsed = crearReporteAtSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const d = parsed.data;

  // Match opcional con cotizante (tipo+número de doc dentro de la sucursal).
  // Sólo soportamos los tipos del catálogo Cotizante (CC, CE, TI, etc.).
  // Si el tipo del reporte (PEP/PPT) no aplica al catálogo, queda en NULL.
  let cotizanteId: string | null = null;
  if (['CC', 'CE', 'TI'].includes(d.trabajadorTipoDoc)) {
    const cot = await prisma.cotizante.findFirst({
      where: {
        sucursalId: d.sucursalId,
        tipoDocumento: d.trabajadorTipoDoc as 'CC' | 'CE' | 'TI',
        numeroDocumento: d.trabajadorNumeroDoc,
      },
      select: { id: true },
    });
    cotizanteId = cot?.id ?? null;
  }

  const consecutivo = await nextReporteAtConsecutivo();

  const reporte = await prisma.reporteAccidenteTrabajo.create({
    data: {
      consecutivo,
      sucursalId: d.sucursalId,
      cotizanteId,
      fechaAccidente: d.fechaAccidente,
      diaSemanaAccidente: diaSemanaEs(d.fechaAccidente),
      horaAccidente: d.horaAccidente,
      horaInicioJornada: d.horaInicioJornada,
      lugar: d.lugar,
      ciudadAccidente: d.ciudadAccidente,
      departamentoAccidente: d.departamentoAccidente,

      trabajadorNombre: d.trabajadorNombre,
      trabajadorTipoDoc: d.trabajadorTipoDoc,
      trabajadorNumeroDoc: d.trabajadorNumeroDoc,
      trabajadorFondoPension: d.trabajadorFondoPension || null,
      trabajadorEps: d.trabajadorEps || null,
      trabajadorCargo: d.trabajadorCargo,
      trabajadorExperienciaMeses: d.trabajadorExperienciaMeses ?? null,
      trabajadorTelefono: d.trabajadorTelefono || null,
      trabajadorDireccion: d.trabajadorDireccion || null,
      trabajadorCiudadResidencia: d.trabajadorCiudadResidencia || null,
      trabajadorEstadoCivil: d.trabajadorEstadoCivil || null,
      trabajadorEdad: d.trabajadorEdad ?? null,

      empresaRazonSocial: d.empresaRazonSocial,
      empresaNit: d.empresaNit,

      hechosQueOcurrio: d.hechosQueOcurrio,
      hechosCuandoDonde: d.hechosCuandoDonde,
      hechosComoOcurrio: d.hechosComoOcurrio,

      causas: d.causas,
      causasOtros: d.causasOtros || null,

      partesCuerpo: d.partesCuerpo,

      responsableNombre: d.responsableNombre,
      responsableTelefono: d.responsableTelefono,
      responsableCorreo: d.responsableCorreo,

      responsable2Nombre: d.responsable2Nombre || null,
      responsable2Telefono: d.responsable2Telefono || null,
      responsable2Correo: d.responsable2Correo || null,

      trabajadorCorreoFirma: d.trabajadorCorreoFirma || null,

      fechaElaboracion: d.fechaElaboracion,
      estado: ReporteATEstado.RADICADO,
      createdById: userId,
    },
    select: { id: true, consecutivo: true, sucursalId: true },
  });

  // Primera gestión — radicación.
  await prisma.reporteATGestion.create({
    data: {
      reporteAtId: reporte.id,
      accionadaPor: 'ALIADO',
      nuevoEstado: ReporteATEstado.RADICADO,
      descripcion: `Radicación inicial · ${d.causas.length} causa(s) · ${d.partesCuerpo.length} parte(s) del cuerpo`,
      userId,
      userName,
    },
  });

  await auditarCreate({
    entidad: 'ReporteAccidenteTrabajo',
    entidadId: reporte.id,
    entidadSucursalId: reporte.sucursalId,
    descripcion: `Reporte AT ${consecutivo} radicado · ${d.trabajadorNombre} (${d.trabajadorTipoDoc} ${d.trabajadorNumeroDoc})`,
    despues: {
      consecutivo,
      fechaAccidente: d.fechaAccidente.toISOString().slice(0, 10),
      cotizanteId,
    },
  });

  revalidatePath('/admin/administrativo/reporte-at');
  revalidatePath('/admin/soporte/reporte-at');

  return {
    ok: true,
    reporteId: reporte.id,
    consecutivo,
    mensaje: `Radicado ${consecutivo}`,
  };
}

// ============ Gestionar (Soporte): cambia estado y/o adjunta soportes ============

/**
 * Action de gestión de Soporte sobre un reporte AT. Recibe FormData con:
 *   - reporteAtId (string)
 *   - nuevoEstado (string del enum)
 *   - descripcion (string, mín. 3 caracteres)
 *   - furat (File opcional) — soporte FURAT u otros documentos
 *   - documentoTipo (opcional, default FURAT)
 *
 * Operaciones que ejecuta:
 *   1. Sube el archivo a UPLOADS_DIR/reporte-at/<id>/... si llega.
 *   2. Cambia el estado del reporte (rechaza si es el mismo estado).
 *   3. Crea una gestión en la bitácora con descripción + estado nuevo.
 *   4. Auditoría del cambio.
 *
 * El archivo subido se conserva 30 días y luego se borra del disco.
 */
export async function gestionarReporteAtAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermiso('soporte.reporte_at');
  const userId = session.user.id;
  const userName = session.user.name;

  const reporteAtId = String(formData.get('reporteAtId') ?? '').trim();
  const nuevoEstadoRaw = String(formData.get('nuevoEstado') ?? '').trim();
  const descripcion = String(formData.get('descripcion') ?? '');
  const documentoTipoRaw = String(formData.get('documentoTipo') ?? 'FURAT').trim();

  if (!reporteAtId) return { error: 'Falta el id del reporte' };
  if (!(ESTADOS_REPORTE_AT as readonly string[]).includes(nuevoEstadoRaw)) {
    return { error: 'Estado no válido' };
  }
  const nuevoEstado = nuevoEstadoRaw as ReporteATEstadoLit;
  const estadoEnum = nuevoEstado as ReporteATEstado;
  const desc = descripcion.trim();
  if (desc.length < 3) return { error: 'La descripción es obligatoria (mín. 3 caracteres)' };

  const documentoTipo =
    documentoTipoRaw === 'OTRO' ? ReporteATDocumentoTipo.OTRO : ReporteATDocumentoTipo.FURAT;

  const r = await prisma.reporteAccidenteTrabajo.findUnique({
    where: { id: reporteAtId },
    select: { id: true, consecutivo: true, estado: true, sucursalId: true },
  });
  if (!r) return { error: 'Reporte no encontrado' };
  if (r.estado === estadoEnum) {
    return { error: `El reporte ya está en estado ${nuevoEstado}` };
  }

  // Archivo opcional. Validamos antes de tocar la BD.
  const furatRaw = formData.get('furat');
  const furat = furatRaw instanceof File && furatRaw.size > 0 ? furatRaw : null;
  if (furat) {
    if (furat.size > TAMANO_MAX_REPORTE_AT) {
      return { error: `El archivo "${furat.name}" supera los 5 MB permitidos.` };
    }
    if (
      !MIMES_PERMITIDOS_REPORTE_AT.includes(
        furat.type as (typeof MIMES_PERMITIDOS_REPORTE_AT)[number],
      )
    ) {
      return {
        error: `Tipo de archivo no permitido (${furat.type || 'desconocido'}). Sólo PDF e imágenes.`,
      };
    }
  }

  // Subimos el archivo primero — si falla, no tocamos el estado.
  if (furat) {
    try {
      const buf = Buffer.from(await furat.arrayBuffer());
      const saved = await guardarDocumentoReporteAt(buf, furat.name, reporteAtId);
      await prisma.reporteATDocumento.create({
        data: {
          reporteAtId,
          tipo: documentoTipo,
          archivoPath: saved.path,
          archivoHash: saved.hash,
          archivoMime: furat.type,
          archivoSize: saved.size,
          archivoNombreOriginal: furat.name,
          userId,
        },
      });
    } catch (err) {
      return {
        error: `No pude guardar el archivo: ${err instanceof Error ? err.message : 'error desconocido'}`,
      };
    }
  }

  await prisma.reporteAccidenteTrabajo.update({
    where: { id: reporteAtId },
    data: { estado: estadoEnum },
  });

  const tipoLabel = documentoTipo === ReporteATDocumentoTipo.FURAT ? 'FURAT' : 'documento';
  const descConArchivo = furat ? `${desc}\n[${tipoLabel} adjunto: ${furat.name}]` : desc;

  await prisma.reporteATGestion.create({
    data: {
      reporteAtId,
      accionadaPor: 'SOPORTE',
      nuevoEstado: estadoEnum,
      descripcion: descConArchivo,
      userId,
      userName,
    },
  });

  await auditarUpdate({
    entidad: 'ReporteAccidenteTrabajo',
    entidadId: reporteAtId,
    entidadSucursalId: r.sucursalId,
    descripcion: `Reporte AT ${r.consecutivo} ${r.estado} → ${nuevoEstado}${furat ? ` (+${tipoLabel})` : ''}`,
    antes: { estado: r.estado },
    despues: { estado: nuevoEstado, ...(furat ? { documento: furat.name } : {}) },
  });

  revalidatePath('/admin/administrativo/reporte-at');
  revalidatePath('/admin/soporte/reporte-at');
  revalidatePath(`/admin/soporte/reporte-at/${reporteAtId}`);
  revalidatePath(`/admin/administrativo/reporte-at/${reporteAtId}`);
  return {
    ok: true,
    mensaje: furat
      ? `Estado actualizado a ${nuevoEstado} con ${tipoLabel} adjunto.`
      : `Estado actualizado a ${nuevoEstado}`,
  };
}

// ============ Gestión / nota desde aliado ============

export async function gestionAliadoReporteAtAction(
  reporteAtId: string,
  descripcion: string,
): Promise<ActionState> {
  const session = await requireAuth();
  const userId = session.user.id;
  const userName = session.user.name;

  const desc = descripcion.trim();
  if (desc.length < 3) return { error: 'La descripción es obligatoria (mín. 3 caracteres)' };

  const scope = await getUserScope();
  if (!scope) return { error: 'Sesión inválida' };

  const r = await prisma.reporteAccidenteTrabajo.findUnique({
    where: { id: reporteAtId },
    select: { id: true, sucursalId: true },
  });
  if (!r) return { error: 'Reporte no encontrado' };
  if (scope.tipo === 'SUCURSAL' && r.sucursalId !== scope.sucursalId) {
    return { error: 'No tienes permiso sobre este reporte' };
  }

  await prisma.reporteATGestion.create({
    data: {
      reporteAtId,
      accionadaPor: 'ALIADO',
      descripcion: desc,
      userId,
      userName,
    },
  });

  revalidatePath('/admin/administrativo/reporte-at');
  revalidatePath('/admin/soporte/reporte-at');
  revalidatePath(`/admin/soporte/reporte-at/${reporteAtId}`);
  return { ok: true };
}
