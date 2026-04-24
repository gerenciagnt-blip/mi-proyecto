import { Prisma, prisma, type Regimen } from '@pila/db';
import { nextCobroAliadoConsecutivo } from './consecutivos';

/**
 * Generación automática del cobro mensual de un aliado (sucursal) para un
 * período contable. Reglas confirmadas con el usuario:
 *
 *  1) Afiliaciones procesadas → SoporteAfiliacion con estado=PROCESADA cuya
 *     fechaRadicacion cae dentro del período. Tarifa según el régimen de la
 *     afiliación (ORDINARIO vs RESOLUCION) tomada de la sucursal.
 *
 *  2) Mensualidades → Comprobantes tipo RECIBO procesados en el período.
 *     Excepción: si la afiliación del cotizante del comprobante tuvo un
 *     retiro que duró ≤5 días (fechaRetiro - fechaIngreso), NO se cobra.
 *
 *  3) fechaLimite = día 15 del mes siguiente al período.
 *
 * Idempotente: si ya existe un CobroAliado para (sucursal, periodo) retorna
 * el existente sin recalcular (a menos que `regenerar=true`, en cuyo caso
 * borra los conceptos y recalcula — manteniendo el mismo consecutivo).
 */

const DIAS_MINIMOS_MENSUALIDAD = 6; // afiliación <6 días (≤5) → NO cobra

export type GenerarCobroResult =
  | { ok: true; cobroId: string; consecutivo: string; totalCobro: number; creado: boolean }
  | { ok: false; error: string };

export type GenerarCobroOptions = {
  sucursalId: string;
  periodoId: string;
  autorUserId?: string | null;
  /** Si true, borra conceptos previos y recalcula (mantiene consecutivo). */
  regenerar?: boolean;
};

type AfiliacionMinima = {
  id: string;
  fechaIngreso: Date;
  fechaRetiro: Date | null;
  regimen: Regimen | null;
};

/** Regla de exclusión: duración de afiliación < 6 días → no cobra mensualidad. */
function excluirPorRetiroCorto(af: AfiliacionMinima): boolean {
  if (!af.fechaRetiro) return false;
  const msDia = 1000 * 60 * 60 * 24;
  const diff = af.fechaRetiro.getTime() - af.fechaIngreso.getTime();
  const dias = Math.floor(diff / msDia);
  return dias < DIAS_MINIMOS_MENSUALIDAD;
}

/** yyyy-mm-15 del mes SIGUIENTE al período. */
function calcularFechaLimite(periodoAnio: number, periodoMes: number): Date {
  // mes en período es 1..12; siguiente mes puede rollear a enero del año sig.
  const anio = periodoMes === 12 ? periodoAnio + 1 : periodoAnio;
  const mes = periodoMes === 12 ? 1 : periodoMes + 1;
  // Día 15, 23:59:59 UTC → da margen hasta fin del día 15 en Colombia (UTC-5)
  return new Date(Date.UTC(anio, mes - 1, 15, 23, 59, 59));
}

export async function generarCobroAliado(opts: GenerarCobroOptions): Promise<GenerarCobroResult> {
  const { sucursalId, periodoId, autorUserId = null, regenerar = false } = opts;

  // 1. Cargar contexto (sucursal con tarifas + período)
  const [sucursal, periodo] = await Promise.all([
    prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: {
        id: true,
        codigo: true,
        active: true,
        tarifaOrdinario: true,
        tarifaResolucion: true,
      },
    }),
    prisma.periodoContable.findUnique({
      where: { id: periodoId },
      select: { id: true, anio: true, mes: true },
    }),
  ]);
  if (!sucursal) return { ok: false, error: 'Sucursal no existe' };
  if (!periodo) return { ok: false, error: 'Período contable no existe' };

  const tarifaOrd = sucursal.tarifaOrdinario ? Number(sucursal.tarifaOrdinario) : 0;
  const tarifaRes = sucursal.tarifaResolucion ? Number(sucursal.tarifaResolucion) : 0;
  if (tarifaOrd === 0 && tarifaRes === 0) {
    return {
      ok: false,
      error: `La sucursal ${sucursal.codigo} no tiene tarifas configuradas`,
    };
  }

  // 2. Rango de fechas del período (YYYY-MM-01 a fin de mes 23:59:59)
  const inicio = new Date(Date.UTC(periodo.anio, periodo.mes - 1, 1, 0, 0, 0));
  const fin = new Date(Date.UTC(periodo.anio, periodo.mes, 0, 23, 59, 59)); // último día

  // 3. ¿Ya existe el cobro?
  const existente = await prisma.cobroAliado.findUnique({
    where: { sucursalId_periodoId: { sucursalId, periodoId } },
    select: { id: true, consecutivo: true, estado: true },
  });
  if (existente && !regenerar) {
    return {
      ok: true,
      cobroId: existente.id,
      consecutivo: existente.consecutivo,
      totalCobro: 0,
      creado: false,
    };
  }
  if (existente && existente.estado !== 'PENDIENTE') {
    return {
      ok: false,
      error: `Cobro ${existente.consecutivo} no está PENDIENTE (estado actual ${existente.estado}) — no se puede regenerar`,
    };
  }

  // 4. Buscar afiliaciones PROCESADAS en soporte-afiliaciones del período
  //    (las que filtraria el staff en esa pantalla)
  const solicitudesProcesadas = await prisma.soporteAfiliacion.findMany({
    where: {
      sucursalId,
      estado: 'PROCESADA',
      fechaRadicacion: { gte: inicio, lte: fin },
    },
    select: {
      id: true,
      afiliacionId: true,
      afiliacion: {
        select: {
          id: true,
          regimen: true,
          cotizante: {
            select: {
              primerNombre: true,
              primerApellido: true,
              numeroDocumento: true,
            },
          },
        },
      },
    },
  });

  // 5. Buscar comprobantes (mensualidades) del período
  //    Comprobantes procesados (procesadoEn en rango), tipo RECIBO y no anulados,
  //    filtrados por scope de sucursal vía cotizante/cuentaCobro/asesor.
  const comprobantes = await prisma.comprobante.findMany({
    where: {
      procesadoEn: { not: null, gte: inicio, lte: fin },
      estado: { not: 'ANULADO' },
      tipo: 'MENSUALIDAD',
      OR: [
        { cotizante: { sucursalId } },
        { cuentaCobro: { sucursalId } },
        {
          asesorComercial: {
            OR: [{ sucursalId: null }, { sucursalId }],
          },
        },
      ],
    },
    select: {
      id: true,
      cotizanteId: true,
      totalGeneral: true,
      cotizante: {
        select: {
          primerNombre: true,
          primerApellido: true,
          numeroDocumento: true,
          afiliaciones: {
            select: {
              id: true,
              regimen: true,
              fechaIngreso: true,
              fechaRetiro: true,
            },
          },
        },
      },
    },
  });

  // 6. Aplicar regla de exclusión por retiro corto y calcular régimen dominante
  //    Para determinar tarifa aplicable a una mensualidad, uso la afiliación
  //    ACTIVA del cotizante (si tiene varias, la más reciente).
  const conceptos: Array<{
    tipo: 'AFILIACION_PROCESADA' | 'MENSUALIDAD';
    descripcion: string;
    referenciaId: string | null;
    regimen: Regimen | null;
    cantidad: number;
    valorUnit: number;
    subtotal: number;
  }> = [];

  // 6.1 Afiliaciones procesadas
  for (const sol of solicitudesProcesadas) {
    const reg = sol.afiliacion?.regimen ?? 'ORDINARIO';
    const tarifa = reg === 'RESOLUCION' ? tarifaRes : tarifaOrd;
    if (tarifa === 0) continue; // sin tarifa configurada para ese régimen → skip
    const cot = sol.afiliacion?.cotizante;
    const nombre = cot ? `${cot.primerNombre} ${cot.primerApellido}`.trim() : '—';
    const doc = cot?.numeroDocumento ?? '—';
    conceptos.push({
      tipo: 'AFILIACION_PROCESADA',
      descripcion: `Afiliación ${doc} · ${nombre} (${reg})`,
      referenciaId: sol.afiliacionId,
      regimen: reg,
      cantidad: 1,
      valorUnit: tarifa,
      subtotal: tarifa,
    });
  }

  // 6.2 Mensualidades (comprobantes)
  for (const c of comprobantes) {
    const afs = c.cotizante?.afiliaciones ?? [];
    // Si TODAS las afiliaciones del cotizante tuvieron retiro ≤5 días → excluir
    const todasExcluidas = afs.length > 0 && afs.every(excluirPorRetiroCorto);
    if (todasExcluidas) continue;

    // Tarifa: tomo el régimen de la primera afiliación con fechaRetiro=null,
    // o la más reciente por fechaIngreso.
    const activa =
      afs.find((a) => a.fechaRetiro === null) ??
      afs.sort((a, b) => b.fechaIngreso.getTime() - a.fechaIngreso.getTime())[0];
    const reg = (activa?.regimen ?? 'ORDINARIO') as Regimen;
    const tarifa = reg === 'RESOLUCION' ? tarifaRes : tarifaOrd;
    if (tarifa === 0) continue;

    const nombre = c.cotizante
      ? `${c.cotizante.primerNombre} ${c.cotizante.primerApellido}`.trim()
      : '—';
    const doc = c.cotizante?.numeroDocumento ?? '—';
    conceptos.push({
      tipo: 'MENSUALIDAD',
      descripcion: `Mensualidad ${doc} · ${nombre} (${reg})`,
      referenciaId: c.id,
      regimen: reg,
      cantidad: 1,
      valorUnit: tarifa,
      subtotal: tarifa,
    });
  }

  if (conceptos.length === 0) {
    return { ok: false, error: 'No hay conceptos cobrables en este período' };
  }

  // 7. Totales
  const cantAfiliaciones = conceptos.filter((c) => c.tipo === 'AFILIACION_PROCESADA').length;
  const cantMensualidades = conceptos.filter((c) => c.tipo === 'MENSUALIDAD').length;
  const valorAfiliaciones = conceptos
    .filter((c) => c.tipo === 'AFILIACION_PROCESADA')
    .reduce((s, c) => s + c.subtotal, 0);
  const valorMensualidades = conceptos
    .filter((c) => c.tipo === 'MENSUALIDAD')
    .reduce((s, c) => s + c.subtotal, 0);
  const totalCobro = valorAfiliaciones + valorMensualidades;
  const fechaLimite = calcularFechaLimite(periodo.anio, periodo.mes);

  // 8. Persistir en transacción
  try {
    const cobroId = await prisma.$transaction(async (tx) => {
      let targetId: string;
      if (existente && regenerar) {
        // Regenerar: borrar conceptos y actualizar totales (mantiene consecutivo)
        await tx.cobroAliadoConcepto.deleteMany({ where: { cobroId: existente.id } });
        await tx.cobroAliado.update({
          where: { id: existente.id },
          data: {
            cantAfiliaciones,
            cantMensualidades,
            valorAfiliaciones: new Prisma.Decimal(valorAfiliaciones),
            valorMensualidades: new Prisma.Decimal(valorMensualidades),
            totalCobro: new Prisma.Decimal(totalCobro),
            fechaLimite,
            updatedAt: new Date(),
          },
        });
        targetId = existente.id;
      } else {
        const consecutivo = await nextCobroAliadoConsecutivo();
        const created = await tx.cobroAliado.create({
          data: {
            consecutivo,
            sucursalId,
            periodoId,
            fechaLimite,
            cantAfiliaciones,
            cantMensualidades,
            valorAfiliaciones: new Prisma.Decimal(valorAfiliaciones),
            valorMensualidades: new Prisma.Decimal(valorMensualidades),
            totalCobro: new Prisma.Decimal(totalCobro),
            estado: 'PENDIENTE',
            createdById: autorUserId,
          },
          select: { id: true },
        });
        targetId = created.id;
      }

      await tx.cobroAliadoConcepto.createMany({
        data: conceptos.map((c) => ({
          cobroId: targetId,
          tipo: c.tipo,
          descripcion: c.descripcion,
          referenciaId: c.referenciaId,
          regimen: c.regimen,
          cantidad: c.cantidad,
          valorUnit: new Prisma.Decimal(c.valorUnit),
          subtotal: new Prisma.Decimal(c.subtotal),
        })),
      });

      return targetId;
    });

    const cobro = await prisma.cobroAliado.findUniqueOrThrow({
      where: { id: cobroId },
      select: { consecutivo: true },
    });
    return {
      ok: true,
      cobroId,
      consecutivo: cobro.consecutivo,
      totalCobro,
      creado: !existente,
    };
  } catch (e) {
    console.error('[cobro-generar] error:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}

/**
 * Genera cobros para TODAS las sucursales activas con tarifas configuradas
 * para un período contable. Se usa desde CLI (pnpm cli cobros:generar) y
 * desde la UI staff.
 */
export async function generarCobrosDelPeriodo(
  periodoId: string,
  autorUserId?: string | null,
): Promise<{
  sucursales: number;
  creados: number;
  saltados: number;
  errores: Array<{ sucursalId: string; codigo: string; mensaje: string }>;
}> {
  const sucursales = await prisma.sucursal.findMany({
    where: {
      active: true,
      OR: [{ tarifaOrdinario: { not: null } }, { tarifaResolucion: { not: null } }],
    },
    select: { id: true, codigo: true },
    orderBy: { codigo: 'asc' },
  });

  let creados = 0;
  let saltados = 0;
  const errores: Array<{ sucursalId: string; codigo: string; mensaje: string }> = [];

  for (const s of sucursales) {
    const res = await generarCobroAliado({
      sucursalId: s.id,
      periodoId,
      autorUserId,
    });
    if (!res.ok) {
      // "No hay conceptos cobrables" se considera salto normal, no error
      if (res.error.includes('No hay conceptos')) {
        saltados++;
      } else {
        errores.push({ sucursalId: s.id, codigo: s.codigo, mensaje: res.error });
      }
    } else if (res.creado) {
      creados++;
    } else {
      saltados++;
    }
  }

  return { sucursales: sucursales.length, creados, saltados, errores };
}

/**
 * Marca cobros vencidos y bloquea las sucursales morosas. Se corre vía cron
 * diario a partir del día 16 de cada mes.
 *
 * Criterio: CobroAliado con estado=PENDIENTE y fechaLimite < now
 *   → cambiar estado a VENCIDO, fechaBloqueo=now, sucursal.bloqueadaPorMora=true.
 */
export async function bloquearCobrosVencidos(ahora = new Date()): Promise<{
  vencidos: number;
  bloqueadas: number;
}> {
  const vencidos = await prisma.cobroAliado.findMany({
    where: {
      estado: 'PENDIENTE',
      fechaLimite: { lt: ahora },
    },
    select: { id: true, sucursalId: true },
  });
  if (vencidos.length === 0) return { vencidos: 0, bloqueadas: 0 };

  const sucursalIdsUnicos = Array.from(new Set(vencidos.map((v) => v.sucursalId)));

  await prisma.$transaction([
    prisma.cobroAliado.updateMany({
      where: { id: { in: vencidos.map((v) => v.id) } },
      data: { estado: 'VENCIDO', fechaBloqueo: ahora },
    }),
    prisma.sucursal.updateMany({
      where: { id: { in: sucursalIdsUnicos } },
      data: { bloqueadaPorMora: true },
    }),
  ]);

  return { vencidos: vencidos.length, bloqueadas: sucursalIdsUnicos.length };
}
