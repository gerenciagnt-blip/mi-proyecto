'use server';

import { revalidatePath } from 'next/cache';
import type { CarteraEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { parseCarteraPdf } from '@/lib/cartera/parse';
import { guardarPdfCartera } from '@/lib/cartera/storage';
import {
  buscarConsolidadoExistente,
  importarParsedCartera,
  type ConsolidadoConflicto,
  type ResultadoImport,
} from '@/lib/cartera/normalizer';
import type { ParsedCartera } from '@/lib/cartera/types';
import { emitirNotificacion } from '@/lib/notificaciones';
import { auditarEvento } from '@/lib/auditoria';

export type ActionState = { error?: string; ok?: boolean; mensaje?: string };

// ============ Preview (parsea sin guardar) ============

export type PreviewResult =
  | {
      ok: true;
      cabecera: {
        origenPdf: ParsedCartera['origenPdf'];
        tipoEntidad: ParsedCartera['tipoEntidad'];
        entidadNombre: string;
        empresaNit: string;
        empresaRazonSocial: string;
        periodoDesde?: string;
        periodoHasta?: string;
        valorTotalInformado: number;
        cantidadLineas: number;
        sumaDetallado: number;
      };
      /** Primeras 10 líneas del detallado para mostrar al usuario. */
      previewLineas: ParsedCartera['detallado'];
      advertencias: string[];
      /** Si ya existe un consolidado con misma clave, datos del existente. */
      conflicto: ConsolidadoConflicto | null;
    }
  | { ok: false; error: string; preview?: string };

/**
 * Recibe el PDF como FormData (campo `file`), lo parsea y devuelve un
 * resumen para el UI (cabecera + primeras 10 líneas + advertencias). El
 * archivo se reparsea al confirmar el import — el preview no persiste.
 */
export async function previewCarteraAction(formData: FormData): Promise<PreviewResult> {
  await requireStaff();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, error: 'Archivo PDF requerido' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: 'El PDF supera los 10 MB permitidos' };
  }
  const buf = Buffer.from(await file.arrayBuffer());

  const parsed = await parseCarteraPdf(buf);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, preview: parsed.preview };
  }

  const conflicto = await buscarConsolidadoExistente(
    parsed.empresaNit,
    parsed.entidadNombre,
    parsed.periodoHasta,
  );
  const sumaDetallado = parsed.detallado.reduce((s, d) => s + d.valorCobro, 0);

  return {
    ok: true,
    cabecera: {
      origenPdf: parsed.origenPdf,
      tipoEntidad: parsed.tipoEntidad,
      entidadNombre: parsed.entidadNombre,
      empresaNit: parsed.empresaNit,
      empresaRazonSocial: parsed.empresaRazonSocial,
      periodoDesde: parsed.periodoDesde,
      periodoHasta: parsed.periodoHasta,
      valorTotalInformado: parsed.valorTotalInformado,
      cantidadLineas: parsed.detallado.length,
      sumaDetallado,
    },
    previewLineas: parsed.detallado.slice(0, 10),
    advertencias: parsed.advertencias,
    conflicto,
  };
}

// ============ Confirmar import ============

/**
 * Persiste el estado de cuenta: guarda el PDF en filesystem y crea
 * CarteraConsolidado + CarteraDetallado[]. Si `reemplazar=true` y existe
 * un consolidado previo con la misma clave, lo borra primero (cascade).
 */
export async function importarCarteraAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { consolidadoId?: string; consecutivo?: string }> {
  const session = await requireStaff();
  const userId = session.user.id;

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { error: 'Archivo PDF requerido' };
  }
  const reemplazar = formData.get('reemplazar') === '1';

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = await parseCarteraPdf(buf);
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  if (parsed.detallado.length === 0) {
    return {
      error:
        'El PDF se reconoció pero no se extrajeron líneas. Revisa si es una imagen escaneada o un formato no soportado aún.',
    };
  }

  // Guardamos el PDF en filesystem local antes de crear la fila.
  const archivo = await guardarPdfCartera(buf, file.name);

  const res: ResultadoImport = await importarParsedCartera(parsed, {
    archivoPath: archivo.path,
    archivoHash: archivo.hash,
    createdById: userId,
    reemplazar,
  });

  if (!res.ok) {
    return { error: res.error };
  }

  revalidatePath('/admin/soporte/cartera');
  return {
    ok: true,
    consolidadoId: res.consolidadoId,
    consecutivo: res.consecutivo,
    mensaje: `Importado ${res.consecutivo} · ${res.cantidadRegistros} líneas${
      res.advertencias.length > 0 ? ` · ${res.advertencias.length} advertencias` : ''
    }`,
  };
}

// ============ Gestión por línea ============

/**
 * Crea una gestión sobre una línea del detallado. Si `nuevoEstado` viene,
 * actualiza también el estado de la línea (y registra el cambio en la
 * bitácora). Si `sucursalAsignadaId` viene, reasigna la sucursal.
 */
export async function gestionarLineaAction(
  detalladoId: string,
  params: {
    descripcion: string;
    nuevoEstado?: CarteraEstado;
    sucursalAsignadaId?: string | null;
  },
): Promise<ActionState> {
  const session = await requireStaff();
  const userId = session.user.id;
  const userName = session.user.name;

  const desc = params.descripcion.trim();
  if (!desc) return { error: 'La descripción es obligatoria' };

  const linea = await prisma.carteraDetallado.findUnique({
    where: { id: detalladoId },
    select: { id: true, estado: true, sucursalAsignadaId: true, consolidadoId: true },
  });
  if (!linea) return { error: 'Línea no encontrada' };

  const cambios: Partial<{ estado: CarteraEstado; sucursalAsignadaId: string | null }> = {};
  if (params.nuevoEstado && params.nuevoEstado !== linea.estado) {
    cambios.estado = params.nuevoEstado;
  }
  if (
    params.sucursalAsignadaId !== undefined &&
    params.sucursalAsignadaId !== linea.sucursalAsignadaId
  ) {
    cambios.sucursalAsignadaId = params.sucursalAsignadaId;
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(cambios).length > 0) {
      await tx.carteraDetallado.update({
        where: { id: detalladoId },
        data: cambios,
      });
    }
    await tx.carteraGestion.create({
      data: {
        detalladoId,
        accionadaPor: 'SOPORTE',
        nuevoEstado: cambios.estado ?? null,
        descripcion: desc,
        userId,
        userName,
      },
    });
  });

  // Bitácora — solo si hubo cambio de estado o reasignación de sucursal.
  // Las gestiones puramente de comentario ya quedan en CarteraGestion;
  // duplicarlas acá es ruido. Sí registramos los eventos de plata real:
  // promoción de estado y reasignación de sucursal (mueve cartera entre
  // aliados).
  if (Object.keys(cambios).length > 0) {
    const partes: string[] = [];
    if (cambios.estado) partes.push(`estado ${linea.estado} → ${cambios.estado}`);
    if (cambios.sucursalAsignadaId !== undefined) {
      partes.push(
        `sucursal ${linea.sucursalAsignadaId ?? 'sin asignar'} → ${cambios.sucursalAsignadaId ?? 'sin asignar'}`,
      );
    }
    const antes: Record<string, unknown> = {};
    const despues: Record<string, unknown> = {};
    const camposCambiados: string[] = [];
    if (cambios.estado) {
      antes.estado = linea.estado;
      despues.estado = cambios.estado;
      camposCambiados.push('estado');
    }
    if (cambios.sucursalAsignadaId !== undefined) {
      antes.sucursalAsignadaId = linea.sucursalAsignadaId;
      despues.sucursalAsignadaId = cambios.sucursalAsignadaId;
      camposCambiados.push('sucursalAsignadaId');
    }
    await auditarEvento({
      entidad: 'CarteraDetallado',
      entidadId: detalladoId,
      accion: 'GESTIONAR_SOPORTE',
      // El evento debe verlo el aliado que recibe (despues) y el que pierde
      // (antes) si hubo reasignación. Por simplicidad capturamos el estado
      // efectivo después del cambio — el actor es staff y el filtro de
      // visibilidad ya considera entidadSucursalId.
      entidadSucursalId:
        cambios.sucursalAsignadaId !== undefined
          ? cambios.sucursalAsignadaId
          : linea.sucursalAsignadaId,
      descripcion: `Soporte gestionó: ${partes.join(' · ')} — ${desc.slice(0, 80)}`,
      cambios: { antes, despues, campos: camposCambiados },
    });
  }

  // Notificar al aliado si la línea acaba de pasar a MORA_REAL o CARTERA_REAL
  // y tiene una sucursal asignada (efectiva, considerando el cambio en este
  // mismo request).
  const sucursalEfectiva =
    cambios.sucursalAsignadaId !== undefined
      ? cambios.sucursalAsignadaId
      : linea.sucursalAsignadaId;
  const estadoEfectivo = cambios.estado ?? linea.estado;
  const acabaDeSerVisible =
    cambios.estado &&
    (cambios.estado === 'MORA_REAL' || cambios.estado === 'CARTERA_REAL') &&
    linea.estado !== cambios.estado;

  if (acabaDeSerVisible && sucursalEfectiva) {
    const ctx = await prisma.carteraDetallado.findUnique({
      where: { id: detalladoId },
      select: {
        numeroDocumento: true,
        nombreCompleto: true,
        valorCobro: true,
        consolidado: { select: { entidadNombre: true } },
      },
    });
    if (ctx) {
      const labelEstado = estadoEfectivo === 'MORA_REAL' ? 'Mora real' : 'Cartera real';
      const valor = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(Number(ctx.valorCobro));
      void emitirNotificacion({
        tipo: 'ALIADO_CARTERA_ASIGNADA',
        destinoSucursalId: sucursalEfectiva,
        titulo: `${labelEstado} asignada · ${ctx.consolidado.entidadNombre}`,
        mensaje: `${ctx.nombreCompleto} (${ctx.numeroDocumento}) · ${valor}`,
        href: '/admin/administrativo/cartera',
        metadatos: {
          detalladoId,
          consolidadoId: linea.consolidadoId,
          estado: estadoEfectivo,
        },
      });
    }
  }

  revalidatePath('/admin/soporte/cartera');
  revalidatePath(`/admin/soporte/cartera/${linea.consolidadoId}`);
  // También en Administrativo por si la línea acaba de pasar a CARTERA_REAL.
  revalidatePath('/admin/administrativo/cartera');
  return { ok: true };
}

// ============ Listar gestiones de una línea ============

export type GestionRow = {
  id: string;
  accionadaPor: 'SOPORTE' | 'ALIADO';
  nuevoEstado: string | null;
  descripcion: string;
  userName: string | null;
  createdAt: Date;
};

/**
 * Devuelve la bitácora de gestiones de una línea, ordenada de más
 * reciente a más antigua. Usada por los dialogs de "Ver gestiones" en
 * ambos módulos (Soporte y Administrativo).
 *
 * Scope: STAFF ve cualquier línea; SUCURSAL sólo las asignadas a su
 * sucursal.
 */
export async function listarGestionesLineaAction(detalladoId: string): Promise<GestionRow[]> {
  const { requireAuth } = await import('@/lib/auth-helpers');
  await requireAuth();
  const { getUserScope } = await import('@/lib/sucursal-scope');
  const scope = await getUserScope();
  if (!scope) return [];

  if (scope.tipo === 'SUCURSAL') {
    const linea = await prisma.carteraDetallado.findUnique({
      where: { id: detalladoId },
      select: { sucursalAsignadaId: true },
    });
    if (!linea || linea.sucursalAsignadaId !== scope.sucursalId) return [];
  }

  const rows = await prisma.carteraGestion.findMany({
    where: { detalladoId },
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
  return rows.map((r) => ({
    ...r,
    nuevoEstado: r.nuevoEstado ?? null,
  }));
}

// ============ Anular consolidado ============

/** Borra el consolidado completo (cascade). Solo ADMIN/SOPORTE. */
export async function anularConsolidadoAction(consolidadoId: string): Promise<ActionState> {
  await requireStaff();
  const existe = await prisma.carteraConsolidado.findUnique({
    where: { id: consolidadoId },
    select: {
      id: true,
      consecutivo: true,
      empresaNit: true,
      entidadNombre: true,
      cantidadRegistros: true,
      valorTotalInformado: true,
    },
  });
  if (!existe) return { error: 'Consolidado no encontrado' };

  await prisma.carteraConsolidado.delete({ where: { id: consolidadoId } });

  // Bitácora — borrar un consolidado destruye TODAS sus líneas y gestiones
  // por cascade. Es operación irreversible que afecta plata/cartera real.
  // Como el consolidado puede contener líneas de varias sucursales,
  // entidadSucursalId queda null (el aliado afectado lo verá como evento
  // de "su recurso desapareció" gracias al filtro userSucursalId del
  // actor staff — ver `whereAuditoriaSegunScope`).
  await auditarEvento({
    entidad: 'CarteraConsolidado',
    entidadId: consolidadoId,
    accion: 'ANULAR',
    entidadSucursalId: null,
    descripcion: `Consolidado ${existe.consecutivo} anulado · ${existe.entidadNombre} (NIT ${existe.empresaNit}) · ${existe.cantidadRegistros} líneas`,
    cambios: {
      antes: {
        consecutivo: existe.consecutivo,
        cantidadRegistros: existe.cantidadRegistros,
        valorTotalInformado: existe.valorTotalInformado.toString(),
      },
      despues: {},
      campos: ['consecutivo', 'cantidadRegistros', 'valorTotalInformado'],
    },
  });

  revalidatePath('/admin/soporte/cartera');
  revalidatePath('/admin/administrativo/cartera');
  return { ok: true, mensaje: `${existe.consecutivo} anulado` };
}
