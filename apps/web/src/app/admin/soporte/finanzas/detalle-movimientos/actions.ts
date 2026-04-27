'use server';

/**
 * Sprint Soporte reorg — Server actions para Detalle Movimientos.
 *
 * - `getDetalleConsultaAction`: snapshot completo para el modal de
 *   consulta (read-only). Incluye datos del movimiento padre y la
 *   lista de detalles hermanos.
 * - `gestionarDetalleMovimientoAction`: aplica cambios desde el modal
 *   de gestión (fechaPago, medioPago, numeroTransaccion, empresa,
 *   estado, observaciones, soporte).
 */

import { revalidatePath } from 'next/cache';
import { Prisma, prisma } from '@pila/db';
import type { MedioPagoFisico, MovimientoDetalleEstado } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import {
  guardarSoporteDetalle,
  MIMES_PERMITIDOS_DETALLE,
  TAMANO_MAX_DETALLE,
} from '@/lib/finanzas/storage-detalle';

export type ActionState = { error?: string; ok?: boolean };

// ============ Consulta (read-only) ============

export type DetalleConsulta = {
  id: string;
  movimiento: {
    id: string;
    consecutivo: string;
    fechaIngreso: string; // ISO
    bancoOrigen: string | null;
    valor: number;
    concepto: string;
    estado: string;
    entidadSgss: { tipo: string; nombre: string } | null;
    empresa: { nombre: string; nit: string } | null;
    /** Detalles hermanos (incluido este) — útil para ver el contexto. */
    detallesHermanos: Array<{
      id: string;
      nombreCompleto: string;
      tipoDocumento: string;
      numeroDocumento: string;
      totalPagar: number;
      estado: MovimientoDetalleEstado;
      esEsteDetalle: boolean;
    }>;
  };
  cotizante: {
    tipoDocumento: string;
    numeroDocumento: string;
    nombreCompleto: string;
    sucursalCodigo: string | null;
  };
  incapacidad: { consecutivo: string } | null;
  fechaInicioInc: string | null;
  fechaFinInc: string | null;
  subtotal: number;
  retencion4x1000: number;
  retencionImpuesto: number;
  totalPagar: number;
  // Pago actual
  estado: MovimientoDetalleEstado;
  fechaPago: string | null;
  medioPago: MedioPagoFisico | null;
  numeroTransaccion: string | null;
  pagadoConEmpresa: { id: string; nombre: string; nit: string } | null;
  observaciones: string | null;
  documentos: Array<{
    id: string;
    nombre: string;
    tamano: number;
    fecha: string;
    userName: string | null;
  }>;
};

export async function getDetalleConsultaAction(
  detalleId: string,
): Promise<{ ok: true; data: DetalleConsulta } | { ok: false; error: string }> {
  await requireStaff();

  const det = await prisma.movimientoIncDetalle.findUnique({
    where: { id: detalleId },
    include: {
      movimiento: {
        include: {
          entidadSgss: { select: { tipo: true, nombre: true } },
          empresa: { select: { nombre: true, nit: true } },
          detalles: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              nombreCompleto: true,
              tipoDocumento: true,
              numeroDocumento: true,
              totalPagar: true,
              estado: true,
            },
          },
        },
      },
      sucursal: { select: { codigo: true } },
      incapacidad: { select: { consecutivo: true } },
      pagadoConEmpresa: { select: { id: true, nombre: true, nit: true } },
      documentos: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
      },
    },
  });

  if (!det) return { ok: false, error: 'Detalle no encontrado' };

  const data: DetalleConsulta = {
    id: det.id,
    movimiento: {
      id: det.movimiento.id,
      consecutivo: det.movimiento.consecutivo,
      fechaIngreso: det.movimiento.fechaIngreso.toISOString(),
      bancoOrigen: det.movimiento.bancoOrigen,
      valor: Number(det.movimiento.valor),
      concepto: det.movimiento.concepto,
      estado: det.movimiento.estado,
      entidadSgss: det.movimiento.entidadSgss
        ? {
            tipo: det.movimiento.entidadSgss.tipo,
            nombre: det.movimiento.entidadSgss.nombre,
          }
        : null,
      empresa: det.movimiento.empresa
        ? { nombre: det.movimiento.empresa.nombre, nit: det.movimiento.empresa.nit }
        : null,
      detallesHermanos: det.movimiento.detalles.map((h) => ({
        id: h.id,
        nombreCompleto: h.nombreCompleto,
        tipoDocumento: h.tipoDocumento,
        numeroDocumento: h.numeroDocumento,
        totalPagar: Number(h.totalPagar),
        estado: h.estado,
        esEsteDetalle: h.id === det.id,
      })),
    },
    cotizante: {
      tipoDocumento: det.tipoDocumento,
      numeroDocumento: det.numeroDocumento,
      nombreCompleto: det.nombreCompleto,
      sucursalCodigo: det.sucursal?.codigo ?? null,
    },
    incapacidad: det.incapacidad ? { consecutivo: det.incapacidad.consecutivo } : null,
    fechaInicioInc: det.fechaInicioInc?.toISOString() ?? null,
    fechaFinInc: det.fechaFinInc?.toISOString() ?? null,
    subtotal: Number(det.subtotal),
    retencion4x1000: Number(det.retencion4x1000),
    retencionImpuesto: Number(det.retencionImpuesto),
    totalPagar: Number(det.totalPagar),
    estado: det.estado,
    fechaPago: det.fechaPago?.toISOString() ?? null,
    medioPago: det.medioPago,
    numeroTransaccion: det.numeroTransaccion,
    pagadoConEmpresa: det.pagadoConEmpresa
      ? {
          id: det.pagadoConEmpresa.id,
          nombre: det.pagadoConEmpresa.nombre,
          nit: det.pagadoConEmpresa.nit,
        }
      : null,
    observaciones: det.observaciones,
    documentos: det.documentos.map((d) => ({
      id: d.id,
      nombre: d.archivoNombreOriginal,
      tamano: d.archivoSize,
      fecha: d.createdAt.toISOString(),
      userName: d.user?.name ?? null,
    })),
  };

  return { ok: true, data };
}

// ============ Gestión ============

/**
 * Sprint Soporte reorg — Aplica los cambios del modal de gestión.
 *
 * Reglas:
 * - `numeroTransaccion` es obligatorio si `medioPago=TRANSFERENCIA`,
 *   opcional si `EFECTIVO`.
 * - `pagadoConEmpresaId` se valida (existe + activa).
 * - El soporte (file) es opcional. Si viene, se guarda en
 *   `mov-detalle/<id>/...` y se crea un `MovimientoDetalleDocumento`.
 * - El estado puede ser PENDIENTE / EN_PROCESO / PAGADA / DEVUELTA.
 *   No bloqueamos transiciones — soporte puede corregir errores.
 */
export async function gestionarDetalleMovimientoAction(
  detalleId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();
  const userId = session.user.id;

  const fechaPagoStr = String(formData.get('fechaPago') ?? '').trim();
  const medioPagoStr = String(formData.get('medioPago') ?? '').trim();
  const numeroTransaccionRaw = String(formData.get('numeroTransaccion') ?? '').trim();
  const pagadoConEmpresaIdRaw = String(formData.get('pagadoConEmpresaId') ?? '').trim();
  const estadoStr = String(formData.get('estado') ?? '').trim();
  const observaciones = String(formData.get('observaciones') ?? '').trim() || null;

  // Validar estado
  if (
    estadoStr !== 'PENDIENTE' &&
    estadoStr !== 'EN_PROCESO' &&
    estadoStr !== 'PAGADA' &&
    estadoStr !== 'DEVUELTA'
  ) {
    return { error: 'Estado inválido' };
  }
  const estado = estadoStr as MovimientoDetalleEstado;

  // Validar medio de pago
  let medioPago: MedioPagoFisico | null = null;
  if (medioPagoStr) {
    if (medioPagoStr !== 'EFECTIVO' && medioPagoStr !== 'TRANSFERENCIA') {
      return { error: 'Medio de pago inválido' };
    }
    medioPago = medioPagoStr as MedioPagoFisico;
  }

  // Si dijeron PAGADA, exigimos al menos medioPago + fechaPago para dejar
  // un registro coherente (no se puede "pagar" sin saber cómo ni cuándo).
  if (estado === 'PAGADA') {
    if (!medioPago) {
      return { error: 'Para marcar PAGADA debes seleccionar medio de pago' };
    }
    if (!fechaPagoStr) {
      return { error: 'Para marcar PAGADA debes registrar la fecha de pago' };
    }
  }

  // Validar # transacción según medio
  const numeroTransaccion = numeroTransaccionRaw || null;
  if (medioPago === 'TRANSFERENCIA' && !numeroTransaccion) {
    return {
      error: 'El número de transacción es obligatorio cuando el medio es Transferencia',
    };
  }

  // Validar fecha si vino
  let fechaPago: Date | null = null;
  if (fechaPagoStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPagoStr)) {
      return { error: 'Fecha de pago inválida (formato AAAA-MM-DD)' };
    }
    const [y, m, d] = fechaPagoStr.split('-').map(Number);
    fechaPago = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  }

  // Validar empresa si vino
  const pagadoConEmpresaId = pagadoConEmpresaIdRaw || null;
  if (pagadoConEmpresaId) {
    const emp = await prisma.empresa.findUnique({
      where: { id: pagadoConEmpresaId },
      select: { id: true, active: true },
    });
    if (!emp || !emp.active) {
      return { error: 'Empresa pagadora no existe o está inactiva' };
    }
  }

  // Verificar que el detalle exista (defensa contra IDs forjados).
  const det = await prisma.movimientoIncDetalle.findUnique({
    where: { id: detalleId },
    select: { id: true, movimientoId: true },
  });
  if (!det) return { error: 'Detalle no encontrado' };

  // Preparar archivo (si vino) ANTES de la transacción.
  const file = formData.get('soporte');
  let soportePreparado: {
    path: string;
    hash: string;
    size: number;
    mime: string;
    nombre: string;
  } | null = null;
  if (file instanceof File && file.size > 0) {
    if (!(MIMES_PERMITIDOS_DETALLE as readonly string[]).includes(file.type)) {
      return { error: `Tipo de archivo no permitido: ${file.type}` };
    }
    if (file.size > TAMANO_MAX_DETALLE) {
      return { error: 'Archivo demasiado grande (máx 5 MB)' };
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const saved = await guardarSoporteDetalle(buf, file.name, detalleId);
    soportePreparado = {
      path: saved.path,
      hash: saved.hash,
      size: saved.size,
      mime: file.type,
      nombre: file.name,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.movimientoIncDetalle.update({
        where: { id: detalleId },
        data: {
          fechaPago,
          medioPago,
          numeroTransaccion,
          pagadoConEmpresaId,
          estado,
          observaciones,
        },
      });
      if (soportePreparado) {
        await tx.movimientoDetalleDocumento.create({
          data: {
            detalleId,
            archivoPath: soportePreparado.path,
            archivoHash: soportePreparado.hash,
            archivoMime: soportePreparado.mime,
            archivoSize: soportePreparado.size,
            archivoNombreOriginal: soportePreparado.nombre,
            userId,
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return { error: `Error al guardar (${e.code})` };
    }
    return { error: 'Error al guardar la gestión' };
  }

  revalidatePath('/admin/soporte/finanzas/detalle-movimientos');
  revalidatePath(`/admin/soporte/finanzas/movimientos-incapacidades/${det.movimientoId}`);
  return { ok: true };
}
