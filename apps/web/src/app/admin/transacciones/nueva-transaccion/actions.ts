'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { persistirLiquidacion } from '@/lib/liquidacion/calcular';
import { nextComprobanteConsecutivo } from '@/lib/consecutivo';

// ============ Tipos compartidos ============

export type TipoTransaccion =
  | 'INDIVIDUAL' // mensualidad de un cotizante
  | 'VINCULACION' // afiliación / cobro administrativo de un cotizante
  | 'EMPRESA_CC' // mensualidad agrupada por cuenta de cobro
  | 'ASESOR'; // mensualidad informativa por asesor

export type CotizanteEncontrado = {
  cotizante: {
    id: string;
    tipoDocumento: string;
    numeroDocumento: string;
    nombreCompleto: string;
  };
  afiliaciones: Array<{
    id: string;
    empresaNombre: string | null;
    modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
    nivelRiesgo: string;
    salario: number;
    estado: 'ACTIVA' | 'INACTIVA';
    fechaIngreso: string;
  }>;
  comprobantesPeriodo: Array<{
    id: string;
    consecutivo: string;
    tipo: 'AFILIACION' | 'MENSUALIDAD';
    total: number;
    estado: 'BORRADOR' | 'EMITIDO' | 'PAGADO' | 'ANULADO';
  }>;
};

// ============ Búsquedas ============

/**
 * Busca un cotizante por número de documento y devuelve sus afiliaciones
 * + comprobantes ya emitidos en el período indicado.
 */
export async function buscarCotizanteAction(
  numeroDocumento: string,
  periodoId: string,
): Promise<{ found: CotizanteEncontrado | null; error?: string }> {
  await requireAdmin();

  const doc = numeroDocumento.trim().toUpperCase();
  if (!doc) return { found: null, error: 'Ingresa un número de documento' };

  const cotizante = await prisma.cotizante.findFirst({
    where: { numeroDocumento: doc },
    include: {
      afiliaciones: {
        include: {
          empresa: { select: { nombre: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!cotizante) return { found: null, error: 'Cotizante no encontrado' };

  const comprobantes = await prisma.comprobante.findMany({
    where: {
      periodoId,
      cotizanteId: cotizante.id,
    },
    select: {
      id: true,
      consecutivo: true,
      tipo: true,
      totalGeneral: true,
      estado: true,
    },
    orderBy: { consecutivo: 'asc' },
  });

  const nombreCompleto = [
    cotizante.primerNombre,
    cotizante.segundoNombre,
    cotizante.primerApellido,
    cotizante.segundoApellido,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    found: {
      cotizante: {
        id: cotizante.id,
        tipoDocumento: cotizante.tipoDocumento,
        numeroDocumento: cotizante.numeroDocumento,
        nombreCompleto,
      },
      afiliaciones: cotizante.afiliaciones.map((a) => ({
        id: a.id,
        empresaNombre: a.empresa?.nombre ?? null,
        modalidad: a.modalidad,
        nivelRiesgo: a.nivelRiesgo,
        salario: Number(a.salario),
        estado: a.estado,
        fechaIngreso: a.fechaIngreso.toISOString().slice(0, 10),
      })),
      comprobantesPeriodo: comprobantes.map((c) => ({
        id: c.id,
        consecutivo: c.consecutivo,
        tipo: c.tipo,
        total: Number(c.totalGeneral),
        estado: c.estado,
      })),
    },
  };
}

export type CuentaCobroDisponible = {
  id: string;
  codigo: string;
  razonSocial: string;
  sucursalCodigo: string;
  afiliacionesActivas: number;
};

/**
 * Lista cuentas de cobro con afiliaciones activas y SIN comprobante
 * EMPRESA_CC en el período indicado (solo las "sin movimiento").
 */
export async function listarCuentasCobroSinMovimientoAction(
  periodoId: string,
): Promise<CuentaCobroDisponible[]> {
  await requireAdmin();

  // CCs que YA tienen comprobante EMPRESA_CC en este período
  const conMovimiento = await prisma.comprobante.findMany({
    where: { periodoId, agrupacion: 'EMPRESA_CC', estado: { not: 'ANULADO' } },
    select: { cuentaCobroId: true },
  });
  const excluirIds = new Set(
    conMovimiento.map((c) => c.cuentaCobroId).filter((id): id is string => id != null),
  );

  const cuentas = await prisma.cuentaCobro.findMany({
    where: {
      active: true,
      id: { notIn: Array.from(excluirIds) },
      afiliaciones: { some: { estado: 'ACTIVA' } },
    },
    include: {
      sucursal: { select: { codigo: true } },
      _count: { select: { afiliaciones: { where: { estado: 'ACTIVA' } } } },
    },
    orderBy: [{ sucursal: { codigo: 'asc' } }, { codigo: 'asc' }],
  });

  return cuentas.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    razonSocial: c.razonSocial,
    sucursalCodigo: c.sucursal.codigo,
    afiliacionesActivas: c._count.afiliaciones,
  }));
}

export type AsesorDisponible = {
  id: string;
  codigo: string;
  nombre: string;
  afiliacionesActivas: number;
};

/**
 * Lista asesores comerciales con afiliaciones activas y SIN comprobante
 * ASESOR_COMERCIAL en el período indicado.
 */
export async function listarAsesoresSinMovimientoAction(
  periodoId: string,
): Promise<AsesorDisponible[]> {
  await requireAdmin();

  const conMovimiento = await prisma.comprobante.findMany({
    where: { periodoId, agrupacion: 'ASESOR_COMERCIAL', estado: { not: 'ANULADO' } },
    select: { asesorComercialId: true },
  });
  const excluirIds = new Set(
    conMovimiento
      .map((c) => c.asesorComercialId)
      .filter((id): id is string => id != null),
  );

  const asesores = await prisma.asesorComercial.findMany({
    where: {
      active: true,
      id: { notIn: Array.from(excluirIds) },
      afiliaciones: { some: { estado: 'ACTIVA' } },
    },
    include: {
      _count: { select: { afiliaciones: { where: { estado: 'ACTIVA' } } } },
    },
    orderBy: { codigo: 'asc' },
  });

  return asesores.map((a) => ({
    id: a.id,
    codigo: a.codigo,
    nombre: a.nombre,
    afiliacionesActivas: a._count.afiliaciones,
  }));
}

// ============ Creación de transacción ============

export type CrearTransaccionInput = {
  periodoId: string;
  tipo: TipoTransaccion;
  afiliacionId?: string; // INDIVIDUAL / VINCULACION
  cuentaCobroId?: string; // EMPRESA_CC
  asesorComercialId?: string; // ASESOR
};

export type CrearTransaccionResult = {
  ok?: boolean;
  error?: string;
  comprobanteId?: string;
  consecutivo?: string;
  totalGeneral?: number;
  afiliacionesLiquidadas?: number;
};

/**
 * Crea una transacción (liquidación + comprobante) según el tipo
 * seleccionado. Es la reemplazo del flujo masivo: el admin emite
 * uno-a-uno según el modelo de negocio.
 */
export async function crearTransaccionAction(
  input: CrearTransaccionInput,
): Promise<CrearTransaccionResult> {
  await requireAdmin();

  const periodo = await prisma.periodoContable.findUnique({
    where: { id: input.periodoId },
  });
  if (!periodo) return { error: 'Período no existe' };
  if (periodo.estado === 'CERRADO') {
    return { error: 'Período cerrado — reabrir antes de emitir transacciones' };
  }

  // Determinar qué afiliaciones liquidar y con qué tipo
  let afiliacionIds: string[] = [];
  let forzarTipo: 'VINCULACION' | 'MENSUALIDAD' | undefined;
  let tipoComprobante: 'AFILIACION' | 'MENSUALIDAD';
  let agrupacion: 'INDIVIDUAL' | 'EMPRESA_CC' | 'ASESOR_COMERCIAL';
  let cotizanteId: string | null = null;
  let cuentaCobroId: string | null = null;
  let asesorComercialId: string | null = null;

  switch (input.tipo) {
    case 'INDIVIDUAL': {
      if (!input.afiliacionId) return { error: 'Selecciona una afiliación' };
      afiliacionIds = [input.afiliacionId];
      forzarTipo = 'MENSUALIDAD';
      tipoComprobante = 'MENSUALIDAD';
      agrupacion = 'INDIVIDUAL';
      const af = await prisma.afiliacion.findUnique({
        where: { id: input.afiliacionId },
        select: { cotizanteId: true },
      });
      if (!af) return { error: 'Afiliación no existe' };
      cotizanteId = af.cotizanteId;
      break;
    }
    case 'VINCULACION': {
      if (!input.afiliacionId) return { error: 'Selecciona una afiliación' };
      afiliacionIds = [input.afiliacionId];
      forzarTipo = 'VINCULACION';
      tipoComprobante = 'AFILIACION';
      agrupacion = 'INDIVIDUAL';
      const af = await prisma.afiliacion.findUnique({
        where: { id: input.afiliacionId },
        select: { cotizanteId: true },
      });
      if (!af) return { error: 'Afiliación no existe' };
      cotizanteId = af.cotizanteId;
      break;
    }
    case 'EMPRESA_CC': {
      if (!input.cuentaCobroId) return { error: 'Selecciona una empresa CC' };
      const afs = await prisma.afiliacion.findMany({
        where: { cuentaCobroId: input.cuentaCobroId, estado: 'ACTIVA' },
        select: { id: true },
      });
      if (afs.length === 0) {
        return { error: 'La empresa CC no tiene afiliaciones activas' };
      }
      afiliacionIds = afs.map((a) => a.id);
      forzarTipo = 'MENSUALIDAD';
      tipoComprobante = 'MENSUALIDAD';
      agrupacion = 'EMPRESA_CC';
      cuentaCobroId = input.cuentaCobroId;
      break;
    }
    case 'ASESOR': {
      if (!input.asesorComercialId) return { error: 'Selecciona un asesor' };
      const afs = await prisma.afiliacion.findMany({
        where: { asesorComercialId: input.asesorComercialId, estado: 'ACTIVA' },
        select: { id: true },
      });
      if (afs.length === 0) {
        return { error: 'El asesor no tiene afiliaciones activas' };
      }
      afiliacionIds = afs.map((a) => a.id);
      forzarTipo = 'MENSUALIDAD';
      tipoComprobante = 'MENSUALIDAD';
      agrupacion = 'ASESOR_COMERCIAL';
      asesorComercialId = input.asesorComercialId;
      break;
    }
    default:
      return { error: 'Tipo de transacción inválido' };
  }

  // Persistir/actualizar liquidaciones
  const liquidacionIds: string[] = [];
  const totales = { empleador: 0, trabajador: 0, general: 0 };

  for (const afId of afiliacionIds) {
    try {
      const r = await persistirLiquidacion(prisma, {
        periodoId: input.periodoId,
        afiliacionId: afId,
        forzarTipo,
      });
      if (r) {
        liquidacionIds.push(r.liquidacionId);
        totales.empleador += r.calc.totalEmpleador;
        totales.trabajador += r.calc.totalTrabajador;
        totales.general += r.calc.totalGeneral;
      }
    } catch {
      // continúa con las demás
    }
  }

  if (liquidacionIds.length === 0) {
    return { error: 'Ninguna afiliación se pudo liquidar' };
  }

  // Crear comprobante consolidado
  const consecutivo = await nextComprobanteConsecutivo();
  const comprobante = await prisma.comprobante.create({
    data: {
      periodoId: input.periodoId,
      tipo: tipoComprobante,
      agrupacion,
      consecutivo,
      cotizanteId,
      cuentaCobroId,
      asesorComercialId,
      totalEmpleador: totales.empleador,
      totalTrabajador: totales.trabajador,
      totalGeneral: totales.general,
      liquidaciones: {
        create: liquidacionIds.map((id) => ({ liquidacionId: id })),
      },
    },
  });

  revalidatePath('/admin/transacciones');
  revalidatePath('/admin/transacciones/comprobantes');
  revalidatePath('/admin/transacciones/cartera');

  return {
    ok: true,
    comprobanteId: comprobante.id,
    consecutivo: comprobante.consecutivo,
    totalGeneral: totales.general,
    afiliacionesLiquidadas: liquidacionIds.length,
  };
}
