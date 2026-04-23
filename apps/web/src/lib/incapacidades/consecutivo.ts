import { prisma } from '@pila/db';

/** Siguiente consecutivo INC-000001 para Incapacidad. */
export async function nextIncapacidadConsecutivo(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('incapacidad_consecutivo_seq') AS nextval
  `;
  const n = Number(rows[0]!.nextval);
  return `INC-${String(n).padStart(6, '0')}`;
}
