/**
 * Helpers síncronos — NO viven en el archivo de server actions porque
 * Next.js exige que todo export en un archivo con 'use server' sea async.
 */

/**
 * ¿Se puede cerrar el período?
 * Regla: se habilita faltando 8 días o menos para el fin del mes del período.
 */
export function puedeCerrarPeriodo(periodo: {
  anio: number;
  mes: number;
}): boolean {
  const hoy = new Date();
  // Último día del mes del período (day=0 del mes siguiente)
  const ultimo = new Date(periodo.anio, periodo.mes, 0);
  const diffMs = ultimo.getTime() - hoy.getTime();
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDias <= 8;
}

type AfiliacionMinFact = {
  modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
  formaPago: 'VIGENTE' | 'VENCIDO' | null;
  fechaIngreso: Date;
};

/**
 * ¿Debe una afiliación facturarse como MENSUALIDAD en el período dado?
 *
 * Reglas:
 *   DEPENDIENTE: la primera mensualidad es en el período siguiente al
 *     de afiliación. Ej. afilió 2026-04-17 → aparece en cartera 2026-05.
 *
 *   INDEPENDIENTE VIGENTE: paga por adelantado, aparece en cartera desde
 *     el mismo mes de afiliación. Ej. afilió 2026-04-01 → cartera 2026-04.
 *
 *   INDEPENDIENTE VENCIDO (o sin formaPago): paga mes siguiente. Ej.
 *     afilió 2026-04-01 → cartera 2026-05.
 */
export function debeFacturarseEnPeriodo(
  af: AfiliacionMinFact,
  periodo: { anio: number; mes: number },
): boolean {
  const firstDay = new Date(Date.UTC(periodo.anio, periodo.mes - 1, 1));
  const lastDay = new Date(Date.UTC(periodo.anio, periodo.mes, 0));
  const fechaIng = toUtcDateOnly(af.fechaIngreso);

  if (af.modalidad === 'DEPENDIENTE') {
    return fechaIng.getTime() < firstDay.getTime();
  }

  if (af.formaPago === 'VIGENTE') {
    return fechaIng.getTime() <= lastDay.getTime();
  }

  return fechaIng.getTime() < firstDay.getTime();
}

/**
 * Opciones de facturación para una afiliación elegible en el período.
 *
 * Devuelve los overrides que el caller debe pasar al motor.
 *
 * REGLAS DEL NEGOCIO
 *
 * Dependiente:
 *   - Opera SIEMPRE en modo vencido: los aportes del mes N se pagan en
 *     el mes N+1. Por tanto `periodoAporte = periodoContable - 1`.
 *   - En la primera mensualidad, la fecha de ingreso cae mid-mes del
 *     período de aporte → el motor liquida días proporcionales.
 *   - Desde la 2ª mensualidad en adelante → 30 días completos.
 *
 * Independiente VIGENTE:
 *   - `periodoAporte = periodoContable` (mismo mes).
 *   - Se factura en el mismo mes de afiliación, por lo que en la 1ª
 *     mensualidad la fecha de ingreso cae en ese mes → forzar
 *     MENSUALIDAD proporcional.
 *   - Siguientes mensualidades: aporte = contable, 30 días.
 *
 * Independiente VENCIDO:
 *   - Se aplaza el primer pago 1 mes (se factura en el mes siguiente al
 *     de afiliación) PERO los períodos internos del plano PILA siguen
 *     siendo el mes del aporte (aplica la misma fórmula que vigente).
 *     Por tanto `periodoAporte = periodoContable - 1` siempre.
 *   - En la 1ª mensualidad (contable = mes siguiente al de afiliación),
 *     la fecha de ingreso cae en el período de aporte → proporcional.
 *   - Siguientes mensualidades → 30 días.
 */
export function opcionesFacturacion(
  af: AfiliacionMinFact,
  periodo: { anio: number; mes: number },
): {
  forzarTipo?: 'MENSUALIDAD';
  periodoAporteAnio?: number;
  periodoAporteMes?: number;
} {
  const fechaIng = toUtcDateOnly(af.fechaIngreso);
  const mismoMes =
    fechaIng.getUTCFullYear() === periodo.anio &&
    fechaIng.getUTCMonth() + 1 === periodo.mes;

  // DEPENDIENTE: modo vencido permanente (aporte = mes anterior al contable).
  // Si la fecha de ingreso cae en ese mes de aporte (1ª mensualidad), el
  // motor auto-daría VINCULACION — forzar MENSUALIDAD para que liquide
  // SGSS con días proporcionales.
  if (af.modalidad === 'DEPENDIENTE') {
    const prev = prevPeriodo(periodo);
    const ingresoEnAporte =
      fechaIng.getUTCFullYear() === prev.anio &&
      fechaIng.getUTCMonth() + 1 === prev.mes;
    return {
      forzarTipo: ingresoEnAporte ? 'MENSUALIDAD' : undefined,
      periodoAporteAnio: prev.anio,
      periodoAporteMes: prev.mes,
    };
  }

  // INDEPENDIENTE VIGENTE + fecha dentro del mes → forzar MENSUALIDAD
  // proporcional (sin esto, motor auto-daría VINCULACION).
  if (
    af.modalidad === 'INDEPENDIENTE' &&
    af.formaPago === 'VIGENTE' &&
    mismoMes
  ) {
    return { forzarTipo: 'MENSUALIDAD' };
  }

  // INDEPENDIENTE VENCIDO: aporte = mes anterior al contable. La factura
  // se emite con retraso de 1 mes, pero los períodos del plano PILA
  // reportan el mes de cotización real (mes de afiliación en la 1ª,
  // contable-1 en general). Si fecha de ingreso cae en el mes de aporte,
  // forzar MENSUALIDAD para que motor no genere VINCULACION.
  if (
    af.modalidad === 'INDEPENDIENTE' &&
    (af.formaPago === 'VENCIDO' || af.formaPago === null)
  ) {
    const prev = prevPeriodo(periodo);
    const ingresoEnAporte =
      fechaIng.getUTCFullYear() === prev.anio &&
      fechaIng.getUTCMonth() + 1 === prev.mes;
    return {
      forzarTipo: ingresoEnAporte ? 'MENSUALIDAD' : undefined,
      periodoAporteAnio: prev.anio,
      periodoAporteMes: prev.mes,
    };
  }

  // INDEPENDIENTE VIGENTE fuera del mismo mes (2ª mens en adelante):
  // sin desfase, aporte = contable.
  return {};
}

function toUtcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function prevPeriodo(p: { anio: number; mes: number }): {
  anio: number;
  mes: number;
} {
  if (p.mes === 1) return { anio: p.anio - 1, mes: 12 };
  return { anio: p.anio, mes: p.mes - 1 };
}
