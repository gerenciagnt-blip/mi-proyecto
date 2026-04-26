import { prisma } from '@pila/db';

/**
 * Sugerencia de sucursal para una línea de cartera nueva o sin asignar.
 *
 * Estrategia (en orden de confianza):
 *
 *   1. **Cotizante en BD** → si existe un Cotizante con ese
 *      `numeroDocumento` y tiene `sucursalId`, esa es la respuesta
 *      directa (confianza ALTA).
 *
 *   2. **Histórico de cartera** → si el documento aparece en líneas
 *      previas con `sucursalAsignadaId` definido, sugerimos la sucursal
 *      que más veces se le asignó. Si hay empate, gana la que tuvo
 *      asignación más reciente. Confianza:
 *        - ALTA si >=80% de las líneas previas son a esa sucursal
 *        - MEDIA si entre 50% y 80%
 *        - BAJA si <50% (hay dispersión)
 *
 *   3. **Sin datos** → null. El staff debe asignar manualmente.
 *
 * Esta función es ligera (1-2 queries) y se puede llamar tanto en
 * batch al importar como individualmente desde el panel de soporte.
 */

export type SugerenciaSucursal = {
  sucursalId: string;
  /** Texto humano: "Por cotizante registrado" / "Por histórico (12/15 líneas)". */
  razon: string;
  confianza: 'ALTA' | 'MEDIA' | 'BAJA';
  fuente: 'COTIZANTE' | 'HISTORICO';
};

export type LineaHistorica = {
  sucursalAsignadaId: string | null;
  createdAt: Date;
};

/**
 * Núcleo pure-function: dada la lista de líneas previas, devuelve la
 * mejor sucursal candidata. Aislado para testear sin Prisma.
 */
export function mejorSucursalSugerida(
  historial: LineaHistorica[],
): { sucursalId: string; ocurrencias: number; total: number; ultimaAsignacion: Date } | null {
  // Solo cuentan las que TIENEN sucursal asignada.
  const conSucursal = historial.filter((h): h is LineaHistorica & { sucursalAsignadaId: string } =>
    Boolean(h.sucursalAsignadaId),
  );
  if (conSucursal.length === 0) return null;

  // Conteo por sucursal + última fecha.
  const stats = new Map<string, { ocurrencias: number; ultima: Date }>();
  for (const h of conSucursal) {
    const cur = stats.get(h.sucursalAsignadaId);
    if (!cur) {
      stats.set(h.sucursalAsignadaId, { ocurrencias: 1, ultima: h.createdAt });
    } else {
      cur.ocurrencias += 1;
      if (h.createdAt > cur.ultima) cur.ultima = h.createdAt;
    }
  }

  // Ordenar por: más ocurrencias primero; en empate, más reciente.
  const ranking = Array.from(stats.entries())
    .map(([sucursalId, s]) => ({ sucursalId, ...s }))
    .sort((a, b) => b.ocurrencias - a.ocurrencias || b.ultima.getTime() - a.ultima.getTime());

  const ganadora = ranking[0];
  if (!ganadora) return null; // imposible (filtramos arriba) pero satisface TS
  return {
    sucursalId: ganadora.sucursalId,
    ocurrencias: ganadora.ocurrencias,
    total: conSucursal.length,
    ultimaAsignacion: ganadora.ultima,
  };
}

/** Mapea ratio de ocurrencias a un nivel de confianza humano. */
export function clasificarConfianza(ocurrencias: number, total: number): 'ALTA' | 'MEDIA' | 'BAJA' {
  if (total === 0) return 'BAJA';
  const ratio = ocurrencias / total;
  if (ratio >= 0.8) return 'ALTA';
  if (ratio >= 0.5) return 'MEDIA';
  return 'BAJA';
}

/**
 * Sugiere sucursal para un numeroDocumento. Consulta BD primero al
 * Cotizante y, si no, al histórico de carteraDetallado.
 *
 * Si pasa `excluirDetalladoId`, no considera ese registro al armar el
 * histórico (útil cuando se está sugiriendo para una línea ya creada
 * — no queremos que se "auto-confirme" usando su propio dato).
 */
export async function sugerirSucursalParaDoc(
  numeroDocumento: string,
  opts?: { excluirDetalladoId?: string },
): Promise<SugerenciaSucursal | null> {
  // 1. Cotizante en BD (alta confianza)
  const cotizante = await prisma.cotizante.findFirst({
    where: { numeroDocumento, sucursalId: { not: null } },
    select: { sucursalId: true },
  });
  if (cotizante?.sucursalId) {
    return {
      sucursalId: cotizante.sucursalId,
      razon: 'Por cotizante registrado',
      confianza: 'ALTA',
      fuente: 'COTIZANTE',
    };
  }

  // 2. Histórico
  const historial = await prisma.carteraDetallado.findMany({
    where: {
      numeroDocumento,
      sucursalAsignadaId: { not: null },
      ...(opts?.excluirDetalladoId ? { id: { not: opts.excluirDetalladoId } } : {}),
    },
    select: { sucursalAsignadaId: true, createdAt: true },
    take: 50, // tope defensivo — con 50 líneas históricas es suficiente
    orderBy: { createdAt: 'desc' },
  });
  const mejor = mejorSucursalSugerida(historial);
  if (!mejor) return null;

  return {
    sucursalId: mejor.sucursalId,
    razon: `Por histórico (${mejor.ocurrencias} de ${mejor.total} líneas previas)`,
    confianza: clasificarConfianza(mejor.ocurrencias, mejor.total),
    fuente: 'HISTORICO',
  };
}

/**
 * Versión batch — agrupa todos los documentos en N consultas mínimas.
 * Útil al importar un consolidado con cientos de líneas.
 *
 * Devuelve un mapa numeroDocumento → sucursalId | null. Sólo se incluye
 * el doc si la sugerencia tiene confianza ALTA o MEDIA (BAJA se ignora
 * para no auto-asignar con poca evidencia).
 */
export async function sugerirSucursalesBatch(documentos: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (documentos.length === 0) return out;

  const docsUnicos = Array.from(new Set(documentos));

  // 1. Cotizantes en BD (1 query)
  const cotizantes = await prisma.cotizante.findMany({
    where: { numeroDocumento: { in: docsUnicos }, sucursalId: { not: null } },
    select: { numeroDocumento: true, sucursalId: true },
  });
  for (const c of cotizantes) {
    if (c.sucursalId && !out.has(c.numeroDocumento)) {
      out.set(c.numeroDocumento, c.sucursalId);
    }
  }

  // 2. Para los que no tienen cotizante, consultamos histórico (1 query)
  const docsSinCotizante = docsUnicos.filter((d) => !out.has(d));
  if (docsSinCotizante.length === 0) return out;

  const historial = await prisma.carteraDetallado.findMany({
    where: {
      numeroDocumento: { in: docsSinCotizante },
      sucursalAsignadaId: { not: null },
    },
    select: { numeroDocumento: true, sucursalAsignadaId: true, createdAt: true },
    take: docsSinCotizante.length * 50, // tope: 50 por documento
    orderBy: { createdAt: 'desc' },
  });

  // Agrupar por documento y aplicar la lógica `mejorSucursalSugerida`.
  const porDoc = new Map<string, LineaHistorica[]>();
  for (const h of historial) {
    const lista = porDoc.get(h.numeroDocumento) ?? [];
    lista.push({ sucursalAsignadaId: h.sucursalAsignadaId, createdAt: h.createdAt });
    porDoc.set(h.numeroDocumento, lista);
  }
  for (const [doc, lista] of porDoc) {
    const mejor = mejorSucursalSugerida(lista);
    if (!mejor) continue;
    const conf = clasificarConfianza(mejor.ocurrencias, mejor.total);
    // Sólo auto-asignar si confianza es ALTA o MEDIA — BAJA es muy
    // ambiguo, mejor dejar al staff decidir.
    if (conf === 'ALTA' || conf === 'MEDIA') {
      out.set(doc, mejor.sucursalId);
    }
  }

  return out;
}
