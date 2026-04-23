'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { persistirLiquidacion } from '@/lib/liquidacion/calcular';
import { nextComprobanteConsecutivo } from '@/lib/consecutivo';
import {
  puedeCerrarPeriodo,
  debeFacturarseEnPeriodo,
  opcionesFacturacion,
} from './helpers';

export type ActionState = { error?: string; ok?: boolean; mensaje?: string };

// ============ Gestión (bitácora de cobro) ============

export type AccionGestion = 'LLAMADA' | 'EMAIL' | 'SMS' | 'VISITA' | 'NOTA' | 'OTRO';

async function currentUser() {
  const { auth } = await import('@/auth');
  const session = await auth();
  return session?.user
    ? { id: session.user.id ?? null, name: session.user.name ?? null }
    : { id: null, name: null };
}

export async function registrarGestionAction(
  cotizanteId: string,
  periodoId: string,
  accion: AccionGestion,
  descripcion: string,
): Promise<ActionState> {
  await requireAdmin();
  const desc = descripcion.trim();
  if (!desc) return { error: 'La descripción no puede estar vacía' };

  const u = await currentUser();

  await prisma.gestionCartera.create({
    data: {
      cotizanteId,
      periodoId,
      accion,
      descripcion: desc,
      userId: u.id,
      userName: u.name,
    },
  });

  revalidatePath('/admin/transacciones/cartera');
  return { ok: true };
}

export async function listarGestionesAction(
  cotizanteId: string,
  periodoId: string,
) {
  await requireAdmin();
  return prisma.gestionCartera.findMany({
    where: { cotizanteId, periodoId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      accion: true,
      descripcion: true,
      userName: true,
      createdAt: true,
    },
  });
}

// ============ Cierre masivo del período ============

/**
 * Cierra el período: genera comprobantes automáticos para todos los
 * cotizantes ACTIVOS que no tengan factura procesada, aplicando:
 *   - Días cotizados = 1
 *   - Valor administración = 0
 *   - Servicios adicionales = normales
 *   - Novedad de retiro (inactiva al cotizante)
 *
 * Estas facturas quedan en estado EMITIDO; pueden anularse después para
 * emitir una factura normal.
 */
export async function cerrarPeriodoMasivoAction(
  periodoId: string,
): Promise<ActionState> {
  await requireAdmin();
  const u = await currentUser();
  const userId = u.id;

  const periodo = await prisma.periodoContable.findUnique({
    where: { id: periodoId },
  });
  if (!periodo) return { error: 'Período no existe' };
  if (periodo.estado === 'CERRADO') return { error: 'El período ya está cerrado' };

  if (!puedeCerrarPeriodo({ anio: periodo.anio, mes: periodo.mes })) {
    return {
      error: 'El cierre sólo se habilita en los últimos 8 días del mes.',
    };
  }

  // Cotizantes con MENSUALIDAD procesada y no anulada en el período
  // (las afiliaciones/vinculaciones no cuentan).
  const cotizantesConFactura = await prisma.comprobante.findMany({
    where: {
      periodoId,
      agrupacion: 'INDIVIDUAL',
      tipo: 'MENSUALIDAD',
      estado: { not: 'ANULADO' },
      procesadoEn: { not: null },
    },
    select: { cotizanteId: true },
  });
  const facturadosIds = new Set(
    cotizantesConFactura
      .map((c) => c.cotizanteId)
      .filter((x): x is string => x != null),
  );

  const cotizantesPendientes = await prisma.cotizante.findMany({
    where: {
      afiliaciones: { some: { estado: 'ACTIVA' } },
      id: { notIn: Array.from(facturadosIds) },
    },
    select: {
      id: true,
      afiliaciones: {
        where: { estado: 'ACTIVA' },
        select: {
          id: true,
          modalidad: true,
          formaPago: true,
          fechaIngreso: true,
        },
      },
    },
  });

  // Cotizantes con alguna MENSUALIDAD procesada previamente (en cualquier
  // período, incluyendo el actual si ya hay alguna). Se usa para decidir
  // si una afiliación-dependiente está en "primera mensualidad" — regla
  // que cambia el periodoAporte al mes anterior.
  const pendIds = cotizantesPendientes.map((c) => c.id);
  const cotsConMensualidadPrevia =
    pendIds.length > 0
      ? await prisma.comprobante.findMany({
          where: {
            cotizanteId: { in: pendIds },
            tipo: 'MENSUALIDAD',
            estado: { not: 'ANULADO' },
            procesadoEn: { not: null },
          },
          select: { cotizanteId: true },
          distinct: ['cotizanteId'],
        })
      : [];
  const conMens = new Set(
    cotsConMensualidadPrevia
      .map((r) => r.cotizanteId)
      .filter((x): x is string => x != null),
  );

  const ahora = new Date();
  let procesados = 0;
  let errores = 0;
  const erroresDetalle: { cotizanteId: string; mensaje: string }[] = [];

  // Medio de pago default — tomamos el primero activo si hay.
  const medio = await prisma.medioPago.findFirst({
    where: { active: true },
    orderBy: { codigo: 'asc' },
    select: { id: true },
  });

  for (const c of cotizantesPendientes) {
    // Solo liquida afiliaciones que deben facturarse en este período según
    // modalidad + forma de pago (ver helper `debeFacturarseEnPeriodo`).
    const afsElegibles = c.afiliaciones.filter((af) =>
      debeFacturarseEnPeriodo(
        {
          modalidad: af.modalidad,
          formaPago: af.formaPago,
          fechaIngreso: af.fechaIngreso,
        },
        { anio: periodo.anio, mes: periodo.mes },
      ),
    );
    const afsMap = new Map(afsElegibles.map((a) => [a.id, a]));
    const afIds = afsElegibles.map((a) => a.id);
    if (afIds.length === 0) continue;

    try {
      const liqIds: string[] = [];
      const totales = { sgss: 0, admon: 0, servicios: 0, general: 0 };
      const empTra = { empleador: 0, trabajador: 0 };
      let tipoDetectado: 'VINCULACION' | 'MENSUALIDAD' = 'MENSUALIDAD';

      const esPrimeraMensualidadCot = !conMens.has(c.id);
      for (const afId of afIds) {
        const af = afsMap.get(afId)!;
        const opciones = opcionesFacturacion(
          {
            modalidad: af.modalidad,
            formaPago: af.formaPago,
            fechaIngreso: af.fechaIngreso,
          },
          { anio: periodo.anio, mes: periodo.mes },
          esPrimeraMensualidadCot,
        );
        const r = await persistirLiquidacion(prisma, {
          periodoId,
          afiliacionId: afId,
          diasCotizadosOverride: 1, // regla del cierre
          valorAdminOverride: 0, // regla del cierre
          aplicaArlObligatoria: true, // cierre = novedad de retiro
          forzarTipo: opciones.forzarTipo,
          periodoAporteAnio: opciones.periodoAporteAnio,
          periodoAporteMes: opciones.periodoAporteMes,
        });
        if (r) {
          liqIds.push(r.liquidacionId);
          totales.sgss += r.calc.totalSgss;
          totales.admon += r.calc.totalAdmon;
          totales.servicios += r.calc.totalServicios;
          totales.general += r.calc.totalGeneral;
          empTra.empleador += r.calc.totalEmpleador;
          empTra.trabajador += r.calc.totalTrabajador;
          tipoDetectado = r.calc.tipo;
        }
      }

      if (liqIds.length === 0) {
        errores++;
        continue;
      }

      const consecutivo = await nextComprobanteConsecutivo();
      const tipoComp = tipoDetectado === 'VINCULACION' ? 'AFILIACION' : 'MENSUALIDAD';

      await prisma.$transaction(async (tx) => {
        await tx.comprobante.create({
          data: {
            periodoId,
            tipo: tipoComp,
            agrupacion: 'INDIVIDUAL',
            consecutivo,
            cotizanteId: c.id,
            totalSgss: totales.sgss,
            totalAdmon: totales.admon,
            totalServicios: totales.servicios,
            totalEmpleador: empTra.empleador,
            totalTrabajador: empTra.trabajador,
            totalGeneral: totales.general,
            estado: 'EMITIDO',
            formaPago: 'POR_MEDIO_PAGO',
            medioPagoId: medio?.id ?? null,
            fechaPago: ahora,
            procesadoEn: ahora,
            emitidoEn: ahora,
            valorAdminOverride: 0,
            aplicaNovedadRetiro: true,
            esCierreMasivo: true,
            createdById: userId,
            observaciones: 'Cierre masivo de período — 1 día, admón $0, retiro automático',
            liquidaciones: { create: liqIds.map((id) => ({ liquidacionId: id })) },
          },
        });

        // Inactivar afiliaciones del cotizante (novedad de retiro)
        await tx.afiliacion.updateMany({
          where: { cotizanteId: c.id, estado: 'ACTIVA' },
          data: { estado: 'INACTIVA', fechaRetiro: ahora },
        });
      });

      procesados++;
    } catch (err) {
      errores++;
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      erroresDetalle.push({ cotizanteId: c.id, mensaje });
      console.error(
        `[cerrarPeriodoMasivo] cotizante=${c.id} error:`,
        mensaje,
      );
    }
  }

  // Persistir errores en AuditLog para trazabilidad posterior
  if (erroresDetalle.length > 0) {
    await prisma.auditLog.create({
      data: {
        entidad: 'PeriodoContable',
        entidadId: periodoId,
        accion: 'CIERRE_MASIVO_ERRORES',
        userId,
        descripcion: `${erroresDetalle.length} cotizantes fallaron en cierre masivo`,
        cambios: { errores: erroresDetalle.slice(0, 100) },
      },
    });
  }

  // Marca el período como CERRADO
  await prisma.periodoContable.update({
    where: { id: periodoId },
    data: { estado: 'CERRADO', cerradoEn: ahora },
  });

  revalidatePath('/admin/transacciones/cartera');
  revalidatePath('/admin/transacciones/historial');
  revalidatePath('/admin/transacciones');
  revalidatePath('/admin/base-datos');

  return {
    ok: true,
    mensaje: `Cierre ejecutado · ${procesados} facturas generadas${
      errores > 0 ? ` · ${errores} con error` : ''
    }`,
  };
}
