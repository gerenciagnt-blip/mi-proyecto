'use server';

import { revalidatePath } from 'next/cache';
import { ReporteATCausa, ReporteATEstado, prisma } from '@pila/db';
import { requireAuth, requirePermiso } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { puedeAccederModulo } from '@/lib/permisos-runtime';
import { nextReporteAtConsecutivo } from '@/lib/reporte-at/consecutivo';
import {
  crearReporteAtSchema,
  diaSemanaEs,
  type PartesCuerpoItem,
} from '@/lib/reporte-at/validations';
import { auditarCreate, auditarUpdate } from '@/lib/auditoria';

export type ActionState = {
  error?: string;
  ok?: boolean;
  mensaje?: string;
  reporteId?: string;
  consecutivo?: string;
};

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

// ============ Cambiar estado (Soporte) ============

export async function cambiarEstadoReporteAtAction(
  reporteAtId: string,
  nuevoEstado: ReporteATEstado,
  descripcion: string,
): Promise<ActionState> {
  const session = await requirePermiso('soporte.reporte_at');
  const userId = session.user.id;
  const userName = session.user.name;

  const desc = descripcion.trim();
  if (desc.length < 3) return { error: 'La descripción es obligatoria (mín. 3 caracteres)' };

  const r = await prisma.reporteAccidenteTrabajo.findUnique({
    where: { id: reporteAtId },
    select: { id: true, consecutivo: true, estado: true, sucursalId: true },
  });
  if (!r) return { error: 'Reporte no encontrado' };
  if (r.estado === nuevoEstado) return { error: `El reporte ya está en estado ${nuevoEstado}` };

  await prisma.reporteAccidenteTrabajo.update({
    where: { id: reporteAtId },
    data: { estado: nuevoEstado },
  });

  await prisma.reporteATGestion.create({
    data: {
      reporteAtId,
      accionadaPor: 'SOPORTE',
      nuevoEstado,
      descripcion: desc,
      userId,
      userName,
    },
  });

  await auditarUpdate({
    entidad: 'ReporteAccidenteTrabajo',
    entidadId: reporteAtId,
    entidadSucursalId: r.sucursalId,
    descripcion: `Reporte AT ${r.consecutivo} ${r.estado} → ${nuevoEstado}`,
    antes: { estado: r.estado },
    despues: { estado: nuevoEstado },
  });

  revalidatePath('/admin/administrativo/reporte-at');
  revalidatePath('/admin/soporte/reporte-at');
  revalidatePath(`/admin/soporte/reporte-at/${reporteAtId}`);
  return { ok: true, mensaje: `Estado actualizado a ${nuevoEstado}` };
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
