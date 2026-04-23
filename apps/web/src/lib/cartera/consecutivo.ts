import { prisma } from '@pila/db';

/**
 * Siguiente consecutivo CC-000001 para CarteraConsolidado. Usa la
 * secuencia Postgres creada en la migración F1 para garantizar unicidad
 * cross-transacción.
 */
export async function nextCarteraConsecutivo(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('cartera_consolidado_consecutivo_seq') AS nextval
  `;
  const n = Number(rows[0]!.nextval);
  return `CC-${String(n).padStart(6, '0')}`;
}
