import { prisma } from '@pila/db';

/** Siguiente consecutivo RAT-NNNNNN para Reporte AT (accidentes/incidentes). */
export async function nextReporteAtConsecutivo(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('reporte_at_consecutivo_seq') AS nextval
  `;
  const n = Number(rows[0]!.nextval);
  return `RAT-${String(n).padStart(6, '0')}`;
}
