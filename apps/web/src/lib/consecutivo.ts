import { prisma } from '@pila/db';

/**
 * Genera el siguiente consecutivo con prefijo + número de 4 dígitos.
 * Ejemplos: "EPS-0001", "PLAN-0023".
 *
 * Busca el mayor código existente con ese prefijo y suma 1. Si ninguno
 * tiene el formato esperado, arranca en 0001.
 *
 * No es "atómico" en un entorno con alta concurrencia. Si dos admins
 * crean a la misma hora puede haber colisión; el wrapper de create ya
 * devuelve error por `@unique` en ese caso y el admin reintenta.
 */

type Finder = (where: { codigo: { startsWith: string } }) => Promise<{ codigo: string } | null>;

async function nextCodigo(prefix: string, find: Finder): Promise<string> {
  // Traemos la fila con el código más alto en orden lexicográfico — con padding
  // de 4 dígitos, orden lexicográfico == orden numérico.
  const last = await find({ codigo: { startsWith: `${prefix}-` } });

  let next = 1;
  if (last) {
    const m = last.codigo.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m && m[1]) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

/** Siguiente código para una entidad SGSS, prefijo según tipo. */
export async function nextEntidadSgssCodigo(
  tipo: 'EPS' | 'AFP' | 'ARL' | 'CCF',
): Promise<string> {
  return nextCodigo(tipo, async (where) => {
    const row = await prisma.entidadSgss.findFirst({
      where: { tipo, ...where },
      orderBy: { codigo: 'desc' },
      select: { codigo: true },
    });
    return row;
  });
}

/** Siguiente código para un plan SGSS. */
export async function nextPlanSgssCodigo(): Promise<string> {
  return nextCodigo('PLAN', async (where) => {
    const row = await prisma.planSgss.findFirst({
      where,
      orderBy: { codigo: 'desc' },
      select: { codigo: true },
    });
    return row;
  });
}

/**
 * Siguiente consecutivo global para un comprobante. Formato CMP-000001.
 * Seis dígitos para que alcance mucho tiempo sin reordenar.
 */
export async function nextComprobanteConsecutivo(): Promise<string> {
  const last = await prisma.comprobante.findFirst({
    where: { consecutivo: { startsWith: 'CMP-' } },
    orderBy: { consecutivo: 'desc' },
    select: { consecutivo: true },
  });
  let n = 1;
  if (last) {
    const m = last.consecutivo.match(/^CMP-(\d+)$/);
    if (m && m[1]) n = parseInt(m[1], 10) + 1;
  }
  return `CMP-${String(n).padStart(6, '0')}`;
}
