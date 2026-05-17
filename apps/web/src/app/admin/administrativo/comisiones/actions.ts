'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { auditarEvento } from '@/lib/auditoria';
import { getUserScope } from '@/lib/sucursal-scope';

export type ActionState = { error?: string; ok?: boolean };

/**
 * Sprint Comisiones — desglose vivo de comisión para un (asesor, periodo).
 * No persiste. Las 3 reglas + el bono son booleanos; el % final va de
 * 0/10/20/30/40.
 */
export type ComisionDesglose = {
  asesorId: string;
  asesorCodigo: string;
  asesorNombre: string;
  asesorActivo: boolean;
  generaComision: boolean;
  /** Meta del asesor al momento del cálculo (puede ser null si no se le
   *  asignó). Si null, el cálculo devuelve 0 — no se le puede comisionar. */
  metaMensual: number | null;
  periodoId: string;
  anio: number;
  mes: number;
  periodoEstado: 'ABIERTO' | 'CERRADO';

  // === Métricas calculadas ===
  /** Σ Liquidacion.totalGeneral del periodo, tipo=VINCULACION, asesor=X. */
  valorAfiliacionesNuevas: number;
  cumplimientoMeta: boolean; // A
  afiliacionesIndependientes: number;
  cumplimientoIndependientes: boolean; // B (>=3)
  cotizantesIniciales: number;
  retiros: number;
  porcentajeRetiros: number; // %
  cumplimientoRetiros: boolean; // C (<=8%)
  cumpleLas3: boolean;
  porcentajeAplicado: number; // 0 | 10 | 20 | 30 | 40
  valorComision: number;

  // === Si ya está cerrada ===
  cerrada: boolean;
  cerradaAt: string | null;
  cerradaPorNombre: string | null;
};

const PORCENTAJE_RETIROS_MAX = 8; // %
const INDEPENDIENTES_MIN = 3;

/**
 * Núcleo del cálculo. Devuelve el desglose para un (asesor, periodo). Si
 * el asesor no tiene `generaComision`, devuelve 0% / 0 COP — pero igual
 * llenamos las métricas para reportería.
 */
async function calcular(
  asesorId: string,
  periodoId: string,
): Promise<ComisionDesglose | { error: string }> {
  const [asesor, periodo, snapshot] = await Promise.all([
    prisma.asesorComercial.findUnique({
      where: { id: asesorId },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        active: true,
        generaComision: true,
        metaMensual: true,
      },
    }),
    prisma.periodoContable.findUnique({
      where: { id: periodoId },
      select: { id: true, anio: true, mes: true, estado: true },
    }),
    prisma.comisionAsesor.findUnique({
      where: { asesorId_periodoId: { asesorId, periodoId } },
      select: {
        cerradaAt: true,
        cerradaPor: { select: { name: true } },
      },
    }),
  ]);
  if (!asesor) return { error: 'Asesor no encontrado' };
  if (!periodo) return { error: 'Periodo contable no encontrado' };

  const meta = asesor.metaMensual ? Number(asesor.metaMensual) : null;

  // Rango del mes: [periodoInicio, periodoFin)
  const periodoInicio = new Date(Date.UTC(periodo.anio, periodo.mes - 1, 1));
  const periodoFin = new Date(Date.UTC(periodo.anio, periodo.mes, 1));

  // === Métrica 1: Σ valor afiliaciones nuevas del periodo (tipo=VINCULACION) ===
  // La afiliación pertenece al asesor → asesorComercialId = asesor.id.
  const sumLiq = await prisma.liquidacion.aggregate({
    where: {
      periodoId,
      tipo: 'VINCULACION',
      afiliacion: { asesorComercialId: asesor.id },
    },
    _sum: { totalGeneral: true },
  });
  const valorAfiliaciones = Number(sumLiq._sum.totalGeneral ?? 0);

  // === Métrica 2: afiliaciones nuevas INDEPENDIENTES del periodo ===
  // "Afiliación nueva" la identificamos por la EXISTENCIA de una Liquidacion
  // tipo=VINCULACION para ese (periodo, afiliación). Eso coincide con el
  // criterio del valor.
  const independientes = await prisma.afiliacion.count({
    where: {
      asesorComercialId: asesor.id,
      modalidad: 'INDEPENDIENTE',
      liquidaciones: {
        some: { periodoId, tipo: 'VINCULACION' },
      },
    },
  });

  // === Métrica 3: % retiros del periodo ===
  // Numerador: afiliaciones del asesor con `fechaRetiro` dentro del periodo.
  // Denominador: afiliaciones del asesor que estaban ACTIVAS al inicio del periodo
  // (createdAt < periodoInicio Y (fechaRetiro is NULL O fechaRetiro >= periodoInicio)).
  const [retiros, cotizantesIniciales] = await Promise.all([
    prisma.afiliacion.count({
      where: {
        asesorComercialId: asesor.id,
        fechaRetiro: { gte: periodoInicio, lt: periodoFin },
      },
    }),
    prisma.afiliacion.count({
      where: {
        asesorComercialId: asesor.id,
        createdAt: { lt: periodoInicio },
        OR: [{ fechaRetiro: null }, { fechaRetiro: { gte: periodoInicio } }],
      },
    }),
  ]);
  const porcentajeRetiros = cotizantesIniciales > 0 ? (retiros / cotizantesIniciales) * 100 : 0;

  // === Reglas ===
  const cumplimientoMeta = meta !== null && meta > 0 && valorAfiliaciones >= meta;
  const cumplimientoIndependientes = independientes >= INDEPENDIENTES_MIN;
  const cumplimientoRetiros =
    cotizantesIniciales === 0 ? false : porcentajeRetiros <= PORCENTAJE_RETIROS_MAX;
  // Si no hay cartera previa (cotizantesIniciales=0) no podemos evaluar la
  // estabilidad — la regla queda en false (conservador).

  const cumpleLas3 = cumplimientoMeta && cumplimientoIndependientes && cumplimientoRetiros;
  let porcentajeAplicado = 0;
  if (asesor.generaComision) {
    if (cumplimientoMeta) porcentajeAplicado += 10;
    if (cumplimientoIndependientes) porcentajeAplicado += 10;
    if (cumplimientoRetiros) porcentajeAplicado += 10;
    if (cumpleLas3) porcentajeAplicado += 10;
  }
  const valorComision =
    asesor.generaComision && meta !== null ? Math.round((meta * porcentajeAplicado) / 100) : 0;

  return {
    asesorId: asesor.id,
    asesorCodigo: asesor.codigo,
    asesorNombre: asesor.nombre,
    asesorActivo: asesor.active,
    generaComision: asesor.generaComision,
    metaMensual: meta,
    periodoId: periodo.id,
    anio: periodo.anio,
    mes: periodo.mes,
    periodoEstado: periodo.estado as 'ABIERTO' | 'CERRADO',
    valorAfiliacionesNuevas: valorAfiliaciones,
    cumplimientoMeta,
    afiliacionesIndependientes: independientes,
    cumplimientoIndependientes,
    cotizantesIniciales,
    retiros,
    porcentajeRetiros: Number(porcentajeRetiros.toFixed(2)),
    cumplimientoRetiros,
    cumpleLas3,
    porcentajeAplicado,
    valorComision,
    cerrada: !!snapshot,
    cerradaAt: snapshot?.cerradaAt?.toISOString() ?? null,
    cerradaPorNombre: snapshot?.cerradaPor?.name ?? null,
  };
}

/**
 * Wrapper público: calcula el desglose para un (asesor, periodo).
 * Permisos: el ADMIN siempre puede; el asesor solo si pide el suyo.
 */
export async function calcularComisionAction(
  asesorId: string,
  periodoId: string,
): Promise<{ ok: true; desglose: ComisionDesglose } | { ok: false; error: string }> {
  await requirePermiso('admin.comisiones').catch(async () => {
    await requirePermiso('admin.asesor_comisiones');
  });
  const scope = await getUserScope();
  if (scope?.tipo === 'ASESOR' && scope.asesorComercialId !== asesorId) {
    return { ok: false, error: 'No puedes ver la comisión de otro asesor' };
  }
  const r = await calcular(asesorId, periodoId);
  if ('error' in r) return { ok: false, error: r.error };
  return { ok: true, desglose: r };
}

/**
 * ADMIN cierra la comisión de un (asesor, periodo). Snapshotea el
 * desglose actual en `ComisionAsesor`. Requiere que el periodo contable
 * esté CERRADO (no se cierra comisión sobre un mes vivo — la métrica
 * podría cambiar al día siguiente).
 */
export async function cerrarComisionAction(
  asesorId: string,
  periodoId: string,
): Promise<ActionState> {
  const session = await requirePermiso('admin.comisiones');
  const userId = session.user.id;

  const r = await calcular(asesorId, periodoId);
  if ('error' in r) return { error: r.error };
  if (r.periodoEstado !== 'CERRADO') {
    return {
      error: 'El periodo contable debe estar CERRADO antes de cerrar la comisión',
    };
  }
  if (r.cerrada) return { ok: true }; // idempotente

  try {
    await prisma.comisionAsesor.create({
      data: {
        asesorId,
        periodoId,
        meta: r.metaMensual ?? 0,
        valorAfiliacionesNuevas: r.valorAfiliacionesNuevas,
        cumplimientoMeta: r.cumplimientoMeta,
        afiliacionesIndependientes: r.afiliacionesIndependientes,
        cumplimientoIndependientes: r.cumplimientoIndependientes,
        porcentajeRetiros: r.porcentajeRetiros,
        cumplimientoRetiros: r.cumplimientoRetiros,
        cumpleLas3: r.cumpleLas3,
        porcentajeAplicado: r.porcentajeAplicado,
        valorComision: r.valorComision,
        estado: 'CERRADA',
        cerradaPorUserId: userId,
        cerradaAt: new Date(),
      },
    });
  } catch (e) {
    const isUnique = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
    return { error: isUnique ? 'Ya estaba cerrada' : 'Error al cerrar la comisión' };
  }

  await auditarEvento({
    entidad: 'ComisionAsesor',
    entidadId: asesorId,
    accion: 'UPDATE',
    descripcion: `Comisión cerrada · ${r.asesorCodigo} · ${r.anio}-${String(r.mes).padStart(2, '0')} · ${r.porcentajeAplicado}% = ${r.valorComision}`,
  });

  revalidatePath('/admin/administrativo/comisiones');
  revalidatePath('/admin/asesor/comisiones');
  return { ok: true };
}

export type ComisionListItem = {
  asesorId: string;
  asesorCodigo: string;
  asesorNombre: string;
  generaComision: boolean;
  metaMensual: number | null;
  valorAfiliaciones: number;
  porcentajeAplicado: number;
  valorComision: number;
  cerrada: boolean;
};

/**
 * Lista todas las comisiones del periodo (calculadas en vivo) para
 * mostrar en la tabla principal del módulo.
 *
 * ADMIN ve todos los asesores. El asesor (scope ASESOR) solo ve el suyo.
 */
export async function listarComisionesPeriodoAction(
  periodoId: string,
): Promise<{ ok: true; items: ComisionListItem[] } | { ok: false; error: string }> {
  await requirePermiso('admin.comisiones').catch(async () => {
    await requirePermiso('admin.asesor_comisiones');
  });
  const scope = await getUserScope();

  const asesores = await prisma.asesorComercial.findMany({
    where: {
      active: true,
      ...(scope?.tipo === 'ASESOR' ? { id: scope.asesorComercialId } : {}),
    },
    select: { id: true },
    orderBy: { codigo: 'asc' },
  });

  const items: ComisionListItem[] = [];
  for (const a of asesores) {
    const r = await calcular(a.id, periodoId);
    if ('error' in r) continue;
    items.push({
      asesorId: r.asesorId,
      asesorCodigo: r.asesorCodigo,
      asesorNombre: r.asesorNombre,
      generaComision: r.generaComision,
      metaMensual: r.metaMensual,
      valorAfiliaciones: r.valorAfiliacionesNuevas,
      porcentajeAplicado: r.porcentajeAplicado,
      valorComision: r.valorComision,
      cerrada: r.cerrada,
    });
  }
  return { ok: true, items };
}
