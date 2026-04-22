'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import {
  calcularLiquidacion,
  persistirLiquidacion,
  type CalcResult,
} from '@/lib/liquidacion/calcular';
import { nextComprobanteConsecutivo } from '@/lib/consecutivo';

// ============ Tipos compartidos ============

export type TipoTransaccion = 'INDIVIDUAL' | 'EMPRESA_CC' | 'ASESOR';

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
  /** Si el cotizante ya tiene una factura procesada en el período
   * indicado (cuando se pasa `periodoId` al buscar), devuelve los
   * datos de esa factura para bloquear una duplicada. */
  facturaExistente?: {
    id: string;
    consecutivo: string;
    fechaPago: string | null;
    totalGeneral: number;
  };
};

// ============ Búsquedas ============

export async function buscarCotizanteAction(
  numeroDocumento: string,
  periodoId?: string,
): Promise<{ found: CotizanteEncontrado | null; error?: string }> {
  await requireAdmin();

  const doc = numeroDocumento.trim().toUpperCase();
  if (!doc) return { found: null, error: 'Ingresa un número de documento' };

  const cotizante = await prisma.cotizante.findFirst({
    where: { numeroDocumento: doc },
    include: {
      afiliaciones: {
        include: { empresa: { select: { nombre: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!cotizante) return { found: null, error: 'Cotizante no encontrado' };

  const nombreCompleto = [
    cotizante.primerNombre,
    cotizante.segundoNombre,
    cotizante.primerApellido,
    cotizante.segundoApellido,
  ]
    .filter(Boolean)
    .join(' ');

  // Si se pasó el período, verifica si ya hay MENSUALIDAD procesada.
  // Las AFILIACION/VINCULACION no bloquean la búsqueda — un cotizante
  // puede tener ambas (una afiliación + una mensualidad separadas).
  let facturaExistente: CotizanteEncontrado['facturaExistente'];
  if (periodoId) {
    const comp = await prisma.comprobante.findFirst({
      where: {
        periodoId,
        cotizanteId: cotizante.id,
        tipo: 'MENSUALIDAD',
        estado: { not: 'ANULADO' },
        procesadoEn: { not: null },
      },
      select: {
        id: true,
        consecutivo: true,
        fechaPago: true,
        totalGeneral: true,
      },
    });
    if (comp) {
      facturaExistente = {
        id: comp.id,
        consecutivo: comp.consecutivo,
        fechaPago: comp.fechaPago?.toISOString().slice(0, 10) ?? null,
        totalGeneral: Number(comp.totalGeneral),
      };
    }
  }

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
      facturaExistente,
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

export async function listarCuentasCobroAction(
  periodoId: string,
  soloSinMovimiento = true,
): Promise<CuentaCobroDisponible[]> {
  await requireAdmin();

  let excluirIds = new Set<string>();
  if (soloSinMovimiento) {
    const conMovimiento = await prisma.comprobante.findMany({
      where: { periodoId, agrupacion: 'EMPRESA_CC', estado: { not: 'ANULADO' } },
      select: { cuentaCobroId: true },
    });
    excluirIds = new Set(
      conMovimiento.map((c) => c.cuentaCobroId).filter((id): id is string => id != null),
    );
  }

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

export async function listarAsesoresAction(
  periodoId: string,
  soloSinMovimiento = true,
): Promise<AsesorDisponible[]> {
  await requireAdmin();

  let excluirIds = new Set<string>();
  if (soloSinMovimiento) {
    const conMovimiento = await prisma.comprobante.findMany({
      where: {
        periodoId,
        agrupacion: 'ASESOR_COMERCIAL',
        estado: { not: 'ANULADO' },
      },
      select: { asesorComercialId: true },
    });
    excluirIds = new Set(
      conMovimiento
        .map((c) => c.asesorComercialId)
        .filter((id): id is string => id != null),
    );
  }

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

// ============ Preview (cálculo en memoria sin persistir) ============

export type PreviewRow = {
  afiliacionId: string;
  cotizante: {
    tipoDocumento: string;
    numeroDocumento: string;
    nombreCompleto: string;
  };
  empresaNombre: string | null;
  modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
  tipo: 'VINCULACION' | 'MENSUALIDAD';
  ibc: number;
  diasCotizados: number;
  totalSgss: number;
  totalAdmon: number;
  totalServicios: number;
  totalGeneral: number;
  conceptos: CalcResult['conceptos'];
};

export type PreviewInput = {
  periodoId: string;
  tipo: TipoTransaccion;
  /** Individual: una factura por cotizante (incluye todas sus afiliaciones activas) */
  cotizanteId?: string;
  cuentaCobroId?: string;
  asesorComercialId?: string;
};

export type PreviewResult = {
  ok?: boolean;
  error?: string;
  rows?: PreviewRow[];
  totales?: {
    sgss: number;
    admon: number;
    servicios: number;
    general: number;
  };
};

/**
 * Calcula las liquidaciones en memoria (sin persistir) según el tipo y
 * destinatario elegidos. Sirve para mostrar la tabla-preview antes de
 * pre-facturar. No crea registros en BD.
 */
export async function previsualizarTransaccionAction(
  input: PreviewInput,
): Promise<PreviewResult> {
  await requireAdmin();

  const periodo = await prisma.periodoContable.findUnique({
    where: { id: input.periodoId },
  });
  if (!periodo) return { error: 'Período no existe' };

  // Recopila las afiliaciones a liquidar
  let afIds: string[] = [];
  switch (input.tipo) {
    case 'INDIVIDUAL': {
      if (!input.cotizanteId) return { error: 'Selecciona un cotizante' };
      const afs = await prisma.afiliacion.findMany({
        where: { cotizanteId: input.cotizanteId, estado: 'ACTIVA' },
        select: { id: true },
      });
      afIds = afs.map((a) => a.id);
      break;
    }
    case 'EMPRESA_CC': {
      if (!input.cuentaCobroId) return { error: 'Selecciona una empresa CC' };
      const afs = await prisma.afiliacion.findMany({
        where: { cuentaCobroId: input.cuentaCobroId, estado: 'ACTIVA' },
        select: { id: true },
      });
      afIds = afs.map((a) => a.id);
      break;
    }
    case 'ASESOR': {
      if (!input.asesorComercialId) return { error: 'Selecciona un asesor' };
      const afs = await prisma.afiliacion.findMany({
        where: { asesorComercialId: input.asesorComercialId, estado: 'ACTIVA' },
        select: { id: true },
      });
      afIds = afs.map((a) => a.id);
      break;
    }
  }
  if (afIds.length === 0) return { error: 'Sin afiliaciones a liquidar' };

  const [tarifas, fspRangos, afiliaciones] = await Promise.all([
    prisma.tarifaSgss.findMany({ where: { active: true } }),
    prisma.fspRango.findMany({
      where: { active: true },
      orderBy: { smlvDesde: 'asc' },
    }),
    prisma.afiliacion.findMany({
      where: { id: { in: afIds } },
      include: {
        cotizante: true,
        empresa: {
          select: {
            id: true,
            nombre: true,
            exoneraLey1607: true,
            arl: { select: { nombre: true } },
          },
        },
        planSgss: {
          select: {
            incluyeEps: true,
            incluyeAfp: true,
            incluyeArl: true,
            incluyeCcf: true,
          },
        },
        eps: { select: { nombre: true } },
        afp: { select: { nombre: true } },
        arl: { select: { nombre: true } },
        ccf: { select: { nombre: true } },
        serviciosAdicionales: {
          include: {
            servicio: {
              select: { id: true, codigo: true, nombre: true, precio: true },
            },
          },
        },
      },
    }),
  ]);

  const rows: PreviewRow[] = [];
  for (const af of afiliaciones) {
    const calc = calcularLiquidacion(
      {
        afiliacion: {
          id: af.id,
          modalidad: af.modalidad,
          nivelRiesgo: af.nivelRiesgo,
          salario: af.salario,
          valorAdministracion: af.valorAdministracion,
          fechaIngreso: af.fechaIngreso,
          empresa: af.empresa,
          planSgss: af.planSgss,
          eps: af.eps,
          afp: af.afp,
          arl: af.arl,
          ccf: af.ccf,
          serviciosAdicionales: af.serviciosAdicionales.map((s) => ({
            id: s.servicio.id,
            codigo: s.servicio.codigo,
            nombre: s.servicio.nombre,
            precio: s.servicio.precio,
          })),
        },
        periodo: { anio: periodo.anio, mes: periodo.mes },
        smlv: periodo.smlvSnapshot,
      },
      tarifas,
      fspRangos,
    );
    if (!calc) continue;

    const nombreCompleto = [
      af.cotizante.primerNombre,
      af.cotizante.segundoNombre,
      af.cotizante.primerApellido,
      af.cotizante.segundoApellido,
    ]
      .filter(Boolean)
      .join(' ');

    rows.push({
      afiliacionId: af.id,
      cotizante: {
        tipoDocumento: af.cotizante.tipoDocumento,
        numeroDocumento: af.cotizante.numeroDocumento,
        nombreCompleto,
      },
      empresaNombre: af.empresa?.nombre ?? null,
      modalidad: af.modalidad,
      tipo: calc.tipo,
      ibc: calc.ibc,
      diasCotizados: calc.diasCotizados,
      totalSgss: calc.totalSgss,
      totalAdmon: calc.totalAdmon,
      totalServicios: calc.totalServicios,
      totalGeneral: calc.totalGeneral,
      conceptos: calc.conceptos,
    });
  }

  if (rows.length === 0) {
    return { error: 'Ninguna afiliación aplica para este período (fechas de ingreso)' };
  }

  const totales = rows.reduce(
    (acc, r) => {
      acc.sgss += r.totalSgss;
      acc.admon += r.totalAdmon;
      acc.servicios += r.totalServicios;
      acc.general += r.totalGeneral;
      return acc;
    },
    { sgss: 0, admon: 0, servicios: 0, general: 0 },
  );

  return { ok: true, rows, totales };
}

// ============ Procesar (persiste comprobante + liquidaciones) ============

export type ProcesarInput = PreviewInput & {
  numeroComprobanteExt?: string;
  formaPago: 'CONSOLIDADO' | 'POR_MEDIO_PAGO';
  fechaPago: string; // yyyy-mm-dd
  medioPagoId?: string;
  /** Override del valor administración — sólo afecta esta transacción.
   * Se aplica a cada afiliación liquidada (mismo valor absoluto). */
  valorAdminOverride?: number;
  /** Override de días cotizados (1..30) — útil al aplicar novedad de
   * retiro parcial; recalcula la base SGSS proporcional. */
  diasCotizadosOverride?: number;
  /** Al procesar, inactiva las afiliaciones del cotizante
   * (sólo INDIVIDUAL). Al anular se revierte. */
  aplicaNovedadRetiro?: boolean;
};

export type ProcesarResult = {
  ok?: boolean;
  error?: string;
  comprobanteId?: string;
  consecutivo?: string;
  totalGeneral?: number;
};

/**
 * Persiste la transacción. Corre el motor sobre las afiliaciones,
 * crea/actualiza las liquidaciones y emite UN comprobante consolidado
 * con los datos de pre-factura.
 */
export async function procesarTransaccionAction(
  input: ProcesarInput,
): Promise<ProcesarResult> {
  await requireAdmin();

  const periodo = await prisma.periodoContable.findUnique({
    where: { id: input.periodoId },
  });
  if (!periodo) return { error: 'Período no existe' };
  // NOTA: si el período está cerrado, permitimos la emisión SOLO si
  // todas las liquidaciones son VINCULACION (afiliaciones nuevas del mes).
  // La validación concreta ocurre después del cálculo del motor, donde
  // ya tenemos `tipoDetectado`.

  // Determinar afiliaciones + agrupación del comprobante
  let afIds: string[] = [];
  let agrupacion: 'INDIVIDUAL' | 'EMPRESA_CC' | 'ASESOR_COMERCIAL';
  let cotizanteId: string | null = null;
  let cuentaCobroId: string | null = null;
  let asesorComercialId: string | null = null;

  switch (input.tipo) {
    case 'INDIVIDUAL': {
      if (!input.cotizanteId) return { error: 'Selecciona un cotizante' };
      const afs = await prisma.afiliacion.findMany({
        where: { cotizanteId: input.cotizanteId, estado: 'ACTIVA' },
        select: { id: true },
      });
      if (afs.length === 0) {
        return { error: 'El cotizante no tiene afiliaciones activas' };
      }
      afIds = afs.map((a) => a.id);
      agrupacion = 'INDIVIDUAL';
      cotizanteId = input.cotizanteId;
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
      afIds = afs.map((a) => a.id);
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
      afIds = afs.map((a) => a.id);
      agrupacion = 'ASESOR_COMERCIAL';
      asesorComercialId = input.asesorComercialId;
      break;
    }
  }

  // Correr motor + persistir liquidaciones
  const liqIds: string[] = [];
  const totales = { sgss: 0, admon: 0, servicios: 0, general: 0 };
  const empTra = { empleador: 0, trabajador: 0 };
  let tipoDetectado: 'VINCULACION' | 'MENSUALIDAD' = 'MENSUALIDAD';

  for (const afId of afIds) {
    try {
      const r = await persistirLiquidacion(prisma, {
        periodoId: input.periodoId,
        afiliacionId: afId,
        valorAdminOverride: input.valorAdminOverride,
        diasCotizadosOverride: input.diasCotizadosOverride,
      });
      if (r) {
        liqIds.push(r.liquidacionId);
        totales.sgss += r.calc.totalSgss;
        totales.admon += r.calc.totalAdmon;
        totales.servicios += r.calc.totalServicios;
        totales.general += r.calc.totalGeneral;
        empTra.empleador += r.calc.totalEmpleador;
        empTra.trabajador += r.calc.totalTrabajador;
        // Si hay varias, gana el tipo más común — para individual es la única
        tipoDetectado = r.calc.tipo;
      }
    } catch {
      // ignora y sigue
    }
  }

  if (liqIds.length === 0) return { error: 'No se pudo liquidar ninguna afiliación' };

  const tipoComp = tipoDetectado === 'VINCULACION' ? 'AFILIACION' : 'MENSUALIDAD';

  // Si el período está CERRADO, sólo se permite emitir VINCULACIÓN
  // (afiliaciones nuevas que ingresaron dentro del mes). Las
  // MENSUALIDADES quedan bloqueadas hasta reabrir.
  if (periodo.estado === 'CERRADO' && tipoComp !== 'AFILIACION') {
    return {
      error:
        'Período cerrado — solo se pueden emitir vinculaciones de afiliaciones nuevas del mes. Reabre el período para procesar mensualidades.',
    };
  }

  // Restricción: una factura por destinatario + período + tipo.
  // Permite 1 AFILIACION + 1 MENSUALIDAD separadas para el mismo cotizante.
  const existeComprobante = await prisma.comprobante.findFirst({
    where: {
      periodoId: input.periodoId,
      tipo: tipoComp,
      estado: { not: 'ANULADO' },
      procesadoEn: { not: null },
      ...(cotizanteId && { cotizanteId }),
      ...(cuentaCobroId && { cuentaCobroId }),
      ...(asesorComercialId && { asesorComercialId }),
    },
    select: { consecutivo: true },
  });
  if (existeComprobante) {
    const destinatarioLabel =
      input.tipo === 'INDIVIDUAL'
        ? 'cotizante'
        : input.tipo === 'EMPRESA_CC'
          ? 'empresa CC'
          : 'asesor';
    const tipoLabel = tipoComp === 'AFILIACION' ? 'afiliación' : 'mensualidad';
    return {
      error: `Ya existe una factura de ${tipoLabel} procesada para este ${destinatarioLabel} en el período (${existeComprobante.consecutivo}).`,
    };
  }

  const consecutivo = await nextComprobanteConsecutivo();
  const ahora = new Date();
  const fechaPago = input.fechaPago ? new Date(input.fechaPago) : ahora;

  // La novedad de retiro sólo aplica a INDIVIDUAL (un cotizante).
  const aplicaNovedadRetiro =
    input.tipo === 'INDIVIDUAL' && !!input.aplicaNovedadRetiro;

  const comprobante = await prisma.$transaction(async (tx) => {
    const comp = await tx.comprobante.create({
      data: {
        periodoId: input.periodoId,
        tipo: tipoComp,
        agrupacion,
        consecutivo,
        cotizanteId,
        cuentaCobroId,
        asesorComercialId,
        totalSgss: totales.sgss,
        totalAdmon: totales.admon,
        totalServicios: totales.servicios,
        totalEmpleador: empTra.empleador,
        totalTrabajador: empTra.trabajador,
        totalGeneral: totales.general,
        estado: 'EMITIDO',
        numeroComprobanteExt: input.numeroComprobanteExt?.trim() || null,
        formaPago: input.formaPago,
        fechaPago,
        medioPagoId:
          input.formaPago === 'POR_MEDIO_PAGO' && input.medioPagoId
            ? input.medioPagoId
            : null,
        procesadoEn: ahora,
        emitidoEn: ahora,
        valorAdminOverride:
          input.valorAdminOverride != null ? input.valorAdminOverride : null,
        aplicaNovedadRetiro,
        liquidaciones: { create: liqIds.map((id) => ({ liquidacionId: id })) },
      },
    });

    // Novedad de retiro: inactivar afiliaciones del cotizante + set fechaRetiro
    if (aplicaNovedadRetiro && cotizanteId) {
      await tx.afiliacion.updateMany({
        where: { cotizanteId, estado: 'ACTIVA' },
        data: { estado: 'INACTIVA', fechaRetiro: ahora },
      });
    }

    return comp;
  });

  revalidatePath('/admin/transacciones');
  revalidatePath('/admin/transacciones/historial');
  revalidatePath('/admin/transacciones/cartera');
  revalidatePath('/admin/base-datos');

  return {
    ok: true,
    comprobanteId: comprobante.id,
    consecutivo: comprobante.consecutivo,
    totalGeneral: totales.general,
  };
}

/**
 * Anula una transacción procesada. Si había aplicado novedad de retiro,
 * reactiva las afiliaciones del cotizante.
 */
export async function anularTransaccionAction(
  comprobanteId: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();

  const comp = await prisma.comprobante.findUnique({
    where: { id: comprobanteId },
    select: {
      id: true,
      estado: true,
      aplicaNovedadRetiro: true,
      esCierreMasivo: true,
      cotizanteId: true,
      periodoId: true,
    },
  });
  if (!comp) return { error: 'Comprobante no existe' };
  if (comp.estado === 'ANULADO') return { error: 'Ya está anulado' };

  await prisma.$transaction(async (tx) => {
    await tx.comprobante.update({
      where: { id: comprobanteId },
      data: { estado: 'ANULADO' },
    });

    // Revertir novedad de retiro: reactivar afiliaciones del cotizante
    if (comp.aplicaNovedadRetiro && comp.cotizanteId) {
      await tx.afiliacion.updateMany({
        where: { cotizanteId: comp.cotizanteId, estado: 'INACTIVA' },
        data: { estado: 'ACTIVA', fechaRetiro: null },
      });
    }

    // Si la factura provenía del cierre masivo, reabrir el período
    // para permitir emitir una factura normal.
    if (comp.esCierreMasivo) {
      const periodo = await tx.periodoContable.findUnique({
        where: { id: comp.periodoId },
        select: { estado: true },
      });
      if (periodo?.estado === 'CERRADO') {
        await tx.periodoContable.update({
          where: { id: comp.periodoId },
          data: { estado: 'ABIERTO', cerradoEn: null },
        });
      }
    }
  });

  revalidatePath('/admin/transacciones');
  revalidatePath('/admin/transacciones/historial');
  revalidatePath('/admin/transacciones/cartera');
  revalidatePath('/admin/base-datos');

  return { ok: true };
}

export async function listarMediosPagoAction(): Promise<
  Array<{ id: string; codigo: string; nombre: string }>
> {
  await requireAdmin();
  const medios = await prisma.medioPago.findMany({
    where: { active: true },
    orderBy: { codigo: 'asc' },
    select: { id: true, codigo: true, nombre: true },
  });
  return medios;
}
