import { prisma } from '@pila/db';

/** Siguiente consecutivo CA-000001 para CobroAliado. */
export async function nextCobroAliadoConsecutivo(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('cobro_aliado_consecutivo_seq') AS nextval
  `;
  const n = Number(rows[0]!.nextval);
  return `CA-${String(n).padStart(6, '0')}`;
}

/** Siguiente consecutivo MI-000001 para MovimientoIncapacidad. */
export async function nextMovimientoIncConsecutivo(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('movimiento_inc_consecutivo_seq') AS nextval
  `;
  const n = Number(rows[0]!.nextval);
  return `MI-${String(n).padStart(6, '0')}`;
}
