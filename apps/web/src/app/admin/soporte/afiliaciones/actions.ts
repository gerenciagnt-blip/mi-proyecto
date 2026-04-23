'use server';

import { revalidatePath } from 'next/cache';
import {
  Prisma,
  prisma,
  type SoporteAfEstado,
  type SoporteAfTipoDisparo,
} from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import {
  guardarDocumentoSoporteAf,
  MIMES_PERMITIDOS,
  TAMANO_MAX,
} from '@/lib/soporte-af/storage';
import { resolverCambios, type CambioRow } from '@/lib/soporte-af/cambios';

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

// ============ Detalle completo para modal ============

export type DetalleSoporteAf = {
  id: string;
  consecutivo: string;
  fechaRadicacion: string;
  estado: SoporteAfEstado;
  estadoObservaciones: string | null;
  disparos: SoporteAfTipoDisparo[];
  creadoPor: { name: string; email: string } | null;
  gestionadoPor: string | null;
  gestionadoEn: string | null;
  sucursal: { codigo: string; nombre: string } | null;
  periodoLabel: string | null;
  cotizante: {
    tipoDocumento: string;
    numeroDocumento: string;
    nombreCompleto: string;
    fechaNacimiento: string | null;
    genero: string;
    telefono: string | null;
    celular: string | null;
    email: string | null;
    direccion: string | null;
    ubicacion: string | null;
  };
  afiliacion: {
    id: string;
    estado: string;
    modalidad: string;
    empresa: string | null;
    tipoSubtipo: string | null;
    plan: string | null;
    regimen: string | null;
    nivelArl: string;
    fechaIngreso: string | null;
    fechaRetiro: string | null;
    salarioLabel: string;
    adminLabel: string;
    formaPago: string | null;
    eps: string | null;
    afp: string | null;
    arl: string | null;
    ccf: string | null;
    actividad: string | null;
    cuentaCobro: string | null;
    asesor: string | null;
    comentarios: string | null;
  };
  cambios: CambioRow[];
  documentos: Array<{
    id: string;
    nombre: string;
    tamano: number;
    mime: string;
    accionadaPor: 'SOPORTE' | 'ALIADO';
    userName: string | null;
    eliminado: boolean;
    fecha: string;
  }>;
  gestiones: Array<{
    id: string;
    accionadaPor: 'SOPORTE' | 'ALIADO';
    descripcion: string;
    nuevoEstado: SoporteAfEstado | null;
    userName: string | null;
    fecha: string;
  }>;
};

function formatCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtFecha(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Devuelve el detalle completo de una solicitud SoporteAfiliacion, con
 * todos los IDs ya resueltos a nombres, listos para renderizar en un
 * componente cliente. Solo staff.
 */
export async function getSoporteAfDetailAction(
  soporteAfId: string,
): Promise<{ ok: true; data: DetalleSoporteAf } | { ok: false; error: string }> {
  await requireStaff();

  const sol = await prisma.soporteAfiliacion.findUnique({
    where: { id: soporteAfId },
    include: {
      createdBy: { select: { name: true, email: true } },
      gestionadoPor: { select: { name: true } },
      sucursal: { select: { codigo: true, nombre: true } },
      periodo: { select: { anio: true, mes: true } },
      afiliacion: {
        include: {
          cotizante: {
            include: {
              departamento: { select: { nombre: true } },
              municipio: { select: { nombre: true } },
            },
          },
          empresa: { select: { nit: true, nombre: true } },
          tipoCotizante: { select: { codigo: true, nombre: true } },
          subtipo: { select: { codigo: true, nombre: true } },
          planSgss: { select: { codigo: true, nombre: true } },
          actividadEconomica: { select: { codigoCiiu: true, descripcion: true } },
          asesorComercial: { select: { codigo: true, nombre: true } },
          cuentaCobro: { select: { codigo: true, razonSocial: true } },
          eps: { select: { nombre: true } },
          afp: { select: { nombre: true } },
          arl: { select: { nombre: true } },
          ccf: { select: { nombre: true } },
        },
      },
      documentos: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
      },
      gestiones: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!sol) return { ok: false, error: 'Solicitud no encontrada' };

  const af = sol.afiliacion;
  const cot = af.cotizante;
  const nombreCompleto = [
    cot.primerNombre,
    cot.segundoNombre,
    cot.primerApellido,
    cot.segundoApellido,
  ]
    .filter(Boolean)
    .join(' ');

  const cambios = await resolverCambios(
    sol.snapshotAntes as Record<string, unknown> | null,
    sol.snapshotDespues as Record<string, unknown> | null,
  );

  const mesNombre = sol.periodo
    ? new Date(sol.periodo.anio, sol.periodo.mes - 1, 1).toLocaleDateString(
        'es-CO',
        { month: 'long', year: 'numeric' },
      )
    : null;

  const data: DetalleSoporteAf = {
    id: sol.id,
    consecutivo: sol.consecutivo,
    fechaRadicacion: sol.fechaRadicacion.toISOString(),
    estado: sol.estado,
    estadoObservaciones: sol.estadoObservaciones,
    disparos: sol.disparos,
    creadoPor: sol.createdBy
      ? { name: sol.createdBy.name, email: sol.createdBy.email }
      : null,
    gestionadoPor: sol.gestionadoPor?.name ?? null,
    gestionadoEn: sol.gestionadoEn?.toISOString() ?? null,
    sucursal: sol.sucursal
      ? { codigo: sol.sucursal.codigo, nombre: sol.sucursal.nombre }
      : null,
    periodoLabel: mesNombre,
    cotizante: {
      tipoDocumento: cot.tipoDocumento,
      numeroDocumento: cot.numeroDocumento,
      nombreCompleto,
      fechaNacimiento: fmtFecha(cot.fechaNacimiento),
      genero: cot.genero,
      telefono: cot.telefono,
      celular: cot.celular,
      email: cot.email,
      direccion: cot.direccion,
      ubicacion:
        [cot.municipio?.nombre, cot.departamento?.nombre]
          .filter(Boolean)
          .join(', ') || null,
    },
    afiliacion: {
      id: af.id,
      estado: af.estado,
      modalidad: af.modalidad === 'DEPENDIENTE' ? 'Dependiente' : 'Independiente',
      empresa: af.empresa ? `${af.empresa.nombre} (NIT ${af.empresa.nit})` : null,
      tipoSubtipo:
        [
          af.tipoCotizante
            ? `${af.tipoCotizante.codigo} · ${af.tipoCotizante.nombre}`
            : null,
          af.subtipo ? `${af.subtipo.codigo} · ${af.subtipo.nombre}` : null,
        ]
          .filter(Boolean)
          .join(' / ') || null,
      plan: af.planSgss ? `${af.planSgss.codigo} · ${af.planSgss.nombre}` : null,
      regimen: af.regimen,
      nivelArl: af.nivelRiesgo,
      fechaIngreso: fmtFecha(af.fechaIngreso),
      fechaRetiro: fmtFecha(af.fechaRetiro),
      salarioLabel: formatCOP(Number(af.salario)),
      adminLabel: formatCOP(Number(af.valorAdministracion)),
      formaPago: af.formaPago,
      eps: af.eps?.nombre ?? null,
      afp: af.afp?.nombre ?? null,
      arl: af.arl?.nombre ?? null,
      ccf: af.ccf?.nombre ?? null,
      actividad: af.actividadEconomica
        ? `${af.actividadEconomica.codigoCiiu} · ${af.actividadEconomica.descripcion}`
        : null,
      cuentaCobro: af.cuentaCobro
        ? `${af.cuentaCobro.codigo} · ${af.cuentaCobro.razonSocial}`
        : null,
      asesor: af.asesorComercial
        ? `${af.asesorComercial.codigo} · ${af.asesorComercial.nombre}`
        : null,
      comentarios: af.comentarios,
    },
    cambios,
    documentos: sol.documentos.map((d) => ({
      id: d.id,
      nombre: d.archivoNombreOriginal,
      tamano: d.archivoSize,
      mime: d.archivoMime,
      accionadaPor: d.accionadaPor,
      userName: d.user?.name ?? null,
      eliminado: d.eliminado,
      fecha: d.createdAt.toISOString(),
    })),
    gestiones: sol.gestiones.map((g) => ({
      id: g.id,
      accionadaPor: g.accionadaPor,
      descripcion: g.descripcion,
      nuevoEstado: g.nuevoEstado,
      userName: g.userName,
      fecha: g.createdAt.toISOString(),
    })),
  };

  return { ok: true, data };
}
