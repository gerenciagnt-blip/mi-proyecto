import { prisma } from '@pila/db';

/**
 * Siguiente consecutivo PQRS-000001 generado por secuencia SQL
 * `pqrs_consecutivo_seq`. Atómico — soporta concurrencia sin colisiones.
 */
export async function nextPqrsConsecutivo(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('pqrs_consecutivo_seq') AS nextval
  `;
  const n = Number(rows[0]!.nextval);
  return `PQRS-${String(n).padStart(6, '0')}`;
}
