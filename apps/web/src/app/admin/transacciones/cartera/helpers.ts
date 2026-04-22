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
  af: {
    modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
    formaPago: 'VIGENTE' | 'VENCIDO' | null;
    fechaIngreso: Date;
  },
  periodo: { anio: number; mes: number },
): boolean {
  // Primer día del período (00:00 UTC)
  const firstDay = new Date(Date.UTC(periodo.anio, periodo.mes - 1, 1));
  // Último día del período
  const lastDay = new Date(Date.UTC(periodo.anio, periodo.mes, 0));
  const fechaIng = new Date(
    Date.UTC(
      af.fechaIngreso.getUTCFullYear(),
      af.fechaIngreso.getUTCMonth(),
      af.fechaIngreso.getUTCDate(),
    ),
  );

  if (af.modalidad === 'DEPENDIENTE') {
    // fechaIngreso estrictamente anterior al primer día del período
    return fechaIng.getTime() < firstDay.getTime();
  }

  // INDEPENDIENTE
  if (af.formaPago === 'VIGENTE') {
    // Afilió este mes o antes
    return fechaIng.getTime() <= lastDay.getTime();
  }

  // VENCIDO (o null) — como dependiente
  return fechaIng.getTime() < firstDay.getTime();
}
