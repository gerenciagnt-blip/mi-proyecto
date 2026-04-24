'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, prisma, type MovimientoFormaPago, type MovimientoDetalleEstado } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';

export type ActionState = { error?: string; ok?: boolean };

const RETENCION_4X1000 = 0.004; // 0.4%
const RETENCION_IMPUESTO = 0.035; // 3.5%

/** Busca por tipoDoc + numDoc el cotizante y su incapacidad más reciente. */
export async function buscarCotizanteAction(
  tipoDocumento: string,
  numeroDocumento: string,
): Promise<{
  ok: boolean;
  cotizante?: {
    id: string;
    nombreCompleto: string;
    sucursalId: string | null;
  };
  incapacidad?: {
    id: string;
    consecutivo: string;
    fechaInicio: string;
    fechaFin: string;
    tipo: string;
    sucursalId: string;
  };
  error?: string;
}> {
  await requireStaff();
  const tipo = tipoDocumento.trim().toUpperCase();
  const num = numeroDocumento.trim().toUpperCase();
  if (!tipo || !num) return { ok: false, error: 'Documento requerido' };

  const cotizante = await prisma.cotizante.findFirst({
    where: {
      tipoDocumento: tipo as 'CC' | 'CE' | 'NIT' | 'PAS' | 'TI' | 'RC' | 'NIP',
      numeroDocumento: num,
    },
    select: {
      id: true,
      primerNombre: true,
      segundoNombre: true,
      primerApellido: true,
      segundoApellido: true,
      sucursalId: true,
    },
  });

  if (!cotizante) return { ok: false, error: 'Cotizante no encontrado' };

  const nombreCompleto = [
    cotizante.primerNombre,
    cotizante.segundoNombre,
    cotizante.primerApellido,
    cotizante.segundoApellido,
  ]
    .filter(Boolean)
    .join(' ');

  // Incapacidad más reciente del cotizante (cualquier estado)
  const incapacidad = await prisma.incapacidad.findFirst({
    where: { cotizanteId: cotizante.id },
    orderBy: { fechaRadicacion: 'desc' },
    select: {
      id: true,
      consecutivo: true,
      fechaInicio: true,
      fechaFin: true,
      tipo: true,
      sucursalId: true,
    },
  });

  return {
    ok: true,
    cotizante: {
      id: cotizante.id,
      nombreCompleto,
      sucursalId: cotizante.sucursalId,
    },
    ...(incapacidad && {
      incapacidad: {
        id: incapacidad.id,
        consecutivo: incapacidad.consecutivo,
        fechaInicio: incapacidad.fechaInicio.toISOString().slice(0, 10),
        fechaFin: incapacidad.fechaFin.toISOString().slice(0, 10),
        tipo: incapacidad.tipo,
        sucursalId: incapacidad.sucursalId,
      },
    }),
  };
}

/**
 * Crea un detalle dentro de un movimiento. Calcula retenciones automáticas:
 *   retencion4x1000   = subtotal * 0.4%
 *   retencionImpuesto = subtotal * 3.5%
 *   totalPagar        = subtotal - retenciones
 */
export async function crearDetalleAction(
  movimientoId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const mov = await prisma.movimientoIncapacidad.findUnique({
    where: { id: movimientoId },
    select: { id: true, estado: true },
  });
  if (!mov) return { error: 'Movimiento no existe' };
  if (mov.estado === 'ANULADO') return { error: 'Movimiento anulado' };

  const tipoDocumento = String(formData.get('tipoDocumento') ?? '')
    .trim()
    .toUpperCase();
  const numeroDocumento = String(formData.get('numeroDocumento') ?? '')
    .trim()
    .toUpperCase();
  const nombreCompleto = String(formData.get('nombreCompleto') ?? '').trim();
  const cotizanteId = String(formData.get('cotizanteId') ?? '').trim() || null;
  const incapacidadId = String(formData.get('incapacidadId') ?? '').trim() || null;
  const sucursalId = String(formData.get('sucursalId') ?? '').trim() || null;
  const formaPago = String(formData.get('formaPago') ?? '') as MovimientoFormaPago;
  const fechaInicioIncRaw = String(formData.get('fechaInicioInc') ?? '').trim();
  const fechaFinIncRaw = String(formData.get('fechaFinInc') ?? '').trim();
  const subtotalRaw = String(formData.get('subtotal') ?? '').trim();
  const observaciones = String(formData.get('observaciones') ?? '').trim() || null;

  if (!tipoDocumento || !numeroDocumento) return { error: 'Documento requerido' };
  if (!nombreCompleto) return { error: 'Nombre completo requerido' };
  if (!['PAGO_COTIZANTE', 'PAGO_ALIADO', 'CRUCE_COBRO_ALIADO'].includes(formaPago)) {
    return { error: 'Forma de pago inválida' };
  }

  const subtotal = Number(subtotalRaw);
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return { error: 'Subtotal inválido (debe ser > 0)' };
  }

  const retencion4x1000 = Math.round(subtotal * RETENCION_4X1000 * 100) / 100;
  const retencionImpuesto = Math.round(subtotal * RETENCION_IMPUESTO * 100) / 100;
  const totalPagar = Math.round((subtotal - retencion4x1000 - retencionImpuesto) * 100) / 100;

  try {
    await prisma.movimientoIncDetalle.create({
      data: {
        movimientoId,
        tipoDocumento,
        numeroDocumento,
        nombreCompleto,
        cotizanteId,
        incapacidadId,
        sucursalId,
        fechaInicioInc: fechaInicioIncRaw ? new Date(fechaInicioIncRaw + 'T00:00:00') : null,
        fechaFinInc: fechaFinIncRaw ? new Date(fechaFinIncRaw + 'T00:00:00') : null,
        subtotal: new Prisma.Decimal(subtotal),
        retencion4x1000: new Prisma.Decimal(retencion4x1000),
        retencionImpuesto: new Prisma.Decimal(retencionImpuesto),
        totalPagar: new Prisma.Decimal(totalPagar),
        formaPago,
        estado: 'PENDIENTE',
        observaciones,
      },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al guardar' };
  }

  revalidatePath(`/admin/soporte/finanzas/movimientos-incapacidades/${movimientoId}`);
  return { ok: true };
}

/** Actualiza estado y pago de un detalle. */
export async function actualizarDetalleAction(
  detalleId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const estado = String(formData.get('estado') ?? '') as MovimientoDetalleEstado;
  const fechaPagoRaw = String(formData.get('fechaPago') ?? '').trim();
  const pagadoConEmpresaId = String(formData.get('pagadoConEmpresaId') ?? '').trim() || null;
  const observaciones = String(formData.get('observaciones') ?? '').trim() || null;

  if (!['PENDIENTE', 'EN_PROCESO', 'PAGADA'].includes(estado)) {
    return { error: 'Estado inválido' };
  }

  const detalle = await prisma.movimientoIncDetalle.findUnique({
    where: { id: detalleId },
    select: { movimientoId: true },
  });
  if (!detalle) return { error: 'Detalle no existe' };

  await prisma.movimientoIncDetalle.update({
    where: { id: detalleId },
    data: {
      estado,
      fechaPago: fechaPagoRaw ? new Date(fechaPagoRaw + 'T00:00:00') : null,
      pagadoConEmpresaId,
      observaciones,
    },
  });

  revalidatePath(`/admin/soporte/finanzas/movimientos-incapacidades/${detalle.movimientoId}`);
  return { ok: true };
}

/** Verifica si la suma de detalles cuadra con el valor del movimiento y
 *  opcionalmente marca como CONCILIADO. */
export async function conciliarMovimientoAction(movimientoId: string): Promise<ActionState> {
  await requireStaff();

  const mov = await prisma.movimientoIncapacidad.findUnique({
    where: { id: movimientoId },
    select: {
      valor: true,
      detalles: { select: { subtotal: true } },
    },
  });
  if (!mov) return { error: 'Movimiento no existe' };

  const sumaDetalles = mov.detalles.reduce((s, d) => s + Number(d.subtotal), 0);
  const valor = Number(mov.valor);
  const diff = Math.abs(sumaDetalles - valor);
  if (diff > 0.01) {
    return {
      error: `La suma de detalles (${sumaDetalles}) no cuadra con el valor (${valor}). Diferencia: ${diff.toFixed(2)}`,
    };
  }

  await prisma.movimientoIncapacidad.update({
    where: { id: movimientoId },
    data: { estado: 'CONCILIADO' },
  });
  revalidatePath(`/admin/soporte/finanzas/movimientos-incapacidades/${movimientoId}`);
  return { ok: true };
}
