/**
 * Normalizador Cartera: convierte `ParsedCartera` (resultado del parser)
 * en las filas BD `CarteraConsolidado` + `CarteraDetallado[]`, haciendo:
 *
 *   1. Match de la empresa por NIT → `empresaId` en BD (si existe).
 *   2. Match del cotizante por número de documento → `cotizanteId` y
 *      `sucursalAsignadaId` derivado de `cotizante.sucursalId`.
 *   3. Detección de re-imports existentes y, si aplica, reemplazo
 *      explícito.
 */

import { prisma } from '@pila/db';
import type { TipoDocumento } from '@pila/db';
import { nextCarteraConsecutivo } from './consecutivo';
import type { ParsedCartera } from './types';

export type ResultadoImport =
  | {
      ok: true;
      consolidadoId: string;
      consecutivo: string;
      cantidadRegistros: number;
      advertencias: string[];
    }
  | { ok: false; error: string; conflicto?: ConsolidadoConflicto };

export type ConsolidadoConflicto = {
  id: string;
  consecutivo: string;
  fechaRegistro: Date;
  cantidadRegistros: number;
};

/**
 * Chequea si ya existe un consolidado para (empresaNit + entidad + periodoHasta).
 * Si existe, devuelve sus datos para que el caller decida si reemplazar.
 */
export async function buscarConsolidadoExistente(
  empresaNit: string,
  entidadNombre: string,
  periodoHasta: string | undefined,
): Promise<ConsolidadoConflicto | null> {
  if (!periodoHasta) return null;
  const existente = await prisma.carteraConsolidado.findUnique({
    where: {
      empresaNit_entidadNombre_periodoHasta: {
        empresaNit,
        entidadNombre,
        periodoHasta,
      },
    },
    select: {
      id: true,
      consecutivo: true,
      fechaRegistro: true,
      cantidadRegistros: true,
    },
  });
  return existente;
}

/**
 * Importa un `ParsedCartera` a BD. Si ya existe un consolidado con la
 * misma combinación (empresa, entidad, periodoHasta) y `reemplazar=false`,
 * devuelve un error con el conflicto para que el caller confirme.
 */
export async function importarParsedCartera(
  parsed: ParsedCartera,
  opciones: {
    archivoPath: string;
    archivoHash: string;
    createdById: string | null;
    reemplazar: boolean;
  },
): Promise<ResultadoImport> {
  const { archivoPath, archivoHash, createdById, reemplazar } = opciones;

  // 1. Conflicto con import previo
  const existente = await buscarConsolidadoExistente(
    parsed.empresaNit,
    parsed.entidadNombre,
    parsed.periodoHasta,
  );
  if (existente && !reemplazar) {
    return {
      ok: false,
      error: `Ya existe un consolidado para esta empresa, entidad y periodo (${existente.consecutivo}). Confirma para reemplazar.`,
      conflicto: existente,
    };
  }

  // 2. Match empresa por NIT
  let empresaId: string | null = null;
  if (parsed.empresaNit) {
    const emp = await prisma.empresa.findUnique({
      where: { nit: parsed.empresaNit },
      select: { id: true },
    });
    empresaId = emp?.id ?? null;
  }

  // 3. Auto-match de cotizantes (un solo query para todos).
  //    Si empresaId está matcheado, buscamos cotizantes cuya sucursal esté
  //    relacionada con esa empresa via afiliaciones. Si no, buscamos por
  //    número de documento global y tomamos el primero (primer cotizante
  //    encontrado — el staff puede reasignar si es ambiguo).
  const docsBuscar = Array.from(
    new Set(parsed.detallado.map((d) => d.numeroDocumento)),
  );
  const cotizantes = docsBuscar.length
    ? await prisma.cotizante.findMany({
        where: { numeroDocumento: { in: docsBuscar } },
        select: {
          id: true,
          numeroDocumento: true,
          tipoDocumento: true,
          sucursalId: true,
        },
      })
    : [];
  // Mapa numeroDocumento -> primer cotizante matcheado (por si hay varios
  // con el mismo doc en distintas sucursales).
  const cotizanteByDoc = new Map<
    string,
    { id: string; tipoDocumento: TipoDocumento; sucursalId: string | null }
  >();
  for (const c of cotizantes) {
    if (!cotizanteByDoc.has(c.numeroDocumento)) {
      cotizanteByDoc.set(c.numeroDocumento, {
        id: c.id,
        tipoDocumento: c.tipoDocumento,
        sucursalId: c.sucursalId,
      });
    }
  }

  // 4. Transacción: borra el consolidado anterior (si reemplazo) y crea
  //    el nuevo con todas las líneas del detallado.
  const consecutivo = await nextCarteraConsecutivo();

  const resultado = await prisma.$transaction(async (tx) => {
    if (existente && reemplazar) {
      await tx.carteraConsolidado.delete({ where: { id: existente.id } });
    }

    const nuevo = await tx.carteraConsolidado.create({
      data: {
        consecutivo,
        tipoEntidad: parsed.tipoEntidad,
        entidadNombre: parsed.entidadNombre,
        entidadNit: parsed.entidadNit ?? null,
        empresaNit: parsed.empresaNit,
        empresaRazonSocial: parsed.empresaRazonSocial,
        empresaId,
        periodoDesde: parsed.periodoDesde ?? null,
        periodoHasta: parsed.periodoHasta ?? null,
        cantidadRegistros: parsed.detallado.length,
        valorTotalInformado: parsed.valorTotalInformado,
        origenPdf: parsed.origenPdf,
        archivoOrigenPath: archivoPath,
        archivoOrigenHash: archivoHash,
        createdById,
        detallado: {
          create: parsed.detallado.map((d) => {
            const match = cotizanteByDoc.get(d.numeroDocumento);
            return {
              tipoDocumento: d.tipoDocumento,
              numeroDocumento: d.numeroDocumento,
              nombreCompleto: d.nombreCompleto,
              periodoCobro: d.periodoCobro,
              valorCobro: d.valorCobro,
              ibc: d.ibc ?? null,
              novedad: d.novedad ?? null,
              cotizanteId: match?.id ?? null,
              sucursalAsignadaId: match?.sucursalId ?? null,
            };
          }),
        },
      },
      select: { id: true, consecutivo: true, cantidadRegistros: true },
    });

    return nuevo;
  });

  return {
    ok: true,
    consolidadoId: resultado.id,
    consecutivo: resultado.consecutivo,
    cantidadRegistros: resultado.cantidadRegistros,
    advertencias: parsed.advertencias,
  };
}
