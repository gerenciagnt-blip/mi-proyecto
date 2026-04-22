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
 * Devuelve los overrides que el caller debe pasar al motor:
 *   - `forzarTipo: MENSUALIDAD` cuando es indep VIGENTE y fecha ingreso
 *     cae dentro del período (el motor auto daría VINCULACION, pero
 *     queremos emitir mensualidad proporcional).
 *   - `periodoAporte` (año + mes) cuando el aporte SGSS corresponde a un
 *     mes distinto del período contable (indep VENCIDO: mes anterior).
 *
 * Si el período de aporte coincide con el período contable, no se
 * devuelve — el caller persiste NULL.
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
  const firstDay = new Date(Date.UTC(periodo.anio, periodo.mes - 1, 1));
  const mismoMes =
    fechaIng.getUTCFullYear() === periodo.anio &&
    fechaIng.getUTCMonth() + 1 === periodo.mes;

  // Indep VIGENTE + fecha dentro del mes → forzar MENSUALIDAD proporcional
  if (
    af.modalidad === 'INDEPENDIENTE' &&
    af.formaPago === 'VIGENTE' &&
    mismoMes
  ) {
    return { forzarTipo: 'MENSUALIDAD' };
  }

  // Indep VENCIDO que se factura en un período POSTERIOR al de afiliación:
  // el aporte SGSS corresponde al mes anterior al período contable.
  if (
    af.modalidad === 'INDEPENDIENTE' &&
    (af.formaPago === 'VENCIDO' || af.formaPago === null) &&
    fechaIng.getTime() < firstDay.getTime()
  ) {
    const prev = prevPeriodo(periodo);
    return { periodoAporteAnio: prev.anio, periodoAporteMes: prev.mes };
  }

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
