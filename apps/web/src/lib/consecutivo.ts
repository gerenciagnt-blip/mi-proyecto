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
export async function nextEntidadSgssCodigo(tipo: 'EPS' | 'AFP' | 'ARL' | 'CCF'): Promise<string> {
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
 * Siguiente código global para una Cuenta de Cobro. Formato CCB-000001.
 * El modelo tiene `@@unique([sucursalId, codigo])`, pero usamos un
 * consecutivo global (no por sucursal) para que el código sea único en
 * todo el sistema y más fácil de identificar.
 */
export async function nextCuentaCobroCodigo(): Promise<string> {
  const last = await prisma.cuentaCobro.findFirst({
    where: { codigo: { startsWith: 'CCB-' } },
    orderBy: { codigo: 'desc' },
    select: { codigo: true },
  });
  let next = 1;
  if (last) {
    const m = last.codigo.match(/^CCB-(\d+)$/);
    if (m && m[1]) next = parseInt(m[1], 10) + 1;
  }
  return `CCB-${String(next).padStart(6, '0')}`;
}

/** Siguiente código global para un Asesor Comercial. Formato AS-0001. */
export async function nextAsesorCodigo(): Promise<string> {
  const last = await prisma.asesorComercial.findFirst({
    where: { codigo: { startsWith: 'AS-' } },
    orderBy: { codigo: 'desc' },
    select: { codigo: true },
  });
  let next = 1;
  if (last) {
    const m = last.codigo.match(/^AS-(\d+)$/);
    if (m && m[1]) next = parseInt(m[1], 10) + 1;
  }
  return `AS-${String(next).padStart(4, '0')}`;
}

/** Siguiente código global para un Servicio Adicional. Formato SRV-0001. */
export async function nextServicioAdicionalCodigo(): Promise<string> {
  const last = await prisma.servicioAdicional.findFirst({
    where: { codigo: { startsWith: 'SRV-' } },
    orderBy: { codigo: 'desc' },
    select: { codigo: true },
  });
  let next = 1;
  if (last) {
    const m = last.codigo.match(/^SRV-(\d+)$/);
    if (m && m[1]) next = parseInt(m[1], 10) + 1;
  }
  return `SRV-${String(next).padStart(4, '0')}`;
}

/**
 * Siguiente consecutivo global para un comprobante. Formato CMP-000001.
 * Usa una SEQUENCE de Postgres (`comprobante_consecutivo_seq`) — atómica
 * por diseño, sin race conditions cuando dos admins procesan en paralelo.
 *
 * Migración que la crea: `20260422200000_comprobante_consecutivo_seq`.
 */
export async function nextComprobanteConsecutivo(): Promise<string> {
  const rows = await prisma.$queryRaw<
    { next_val: bigint }[]
  >`SELECT nextval('comprobante_consecutivo_seq') AS next_val`;
  const n = Number(rows[0]?.next_val ?? 1);
  return `CMP-${String(n).padStart(6, '0')}`;
}

/**
 * Siguiente consecutivo global para una planilla PILA. Formato PLN-000001.
 * Misma estrategia que los comprobantes — SEQUENCE Postgres.
 *
 * Migración: `20260422201000_planilla_consecutivo_seq`.
 */
export async function nextPlanillaConsecutivo(): Promise<string> {
  const rows = await prisma.$queryRaw<
    { next_val: bigint }[]
  >`SELECT nextval('planilla_consecutivo_seq') AS next_val`;
  const n = Number(rows[0]?.next_val ?? 1);
  return `PLN-${String(n).padStart(6, '0')}`;
}
