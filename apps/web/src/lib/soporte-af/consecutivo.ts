import { prisma } from '@pila/db';

/** Siguiente consecutivo SOP-AF-000001 para SoporteAfiliacion. */
export async function nextSoporteAfConsecutivo(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('soporte_af_consecutivo_seq') AS nextval
  `;
  const n = Number(rows[0]!.nextval);
  return `SOP-AF-${String(n).padStart(6, '0')}`;
}
