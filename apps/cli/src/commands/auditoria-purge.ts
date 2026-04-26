/**
 * Job de retención de bitácora — purga registros de `AuditLog` con más
 * de N meses (default 12). Se ejecuta mensualmente desde GitHub Actions
 * para mantener la tabla en un tamaño razonable.
 *
 * Política de retención:
 *   - 12 meses por defecto (configurable con --meses)
 *   - Hard delete (no soft) — la bitácora ya es archivo, no hay
 *     necesidad de preservar tombstones que la engorden más.
 *   - DRY RUN solo cuenta sin borrar (útil para verificar antes de
 *     primera ejecución productiva).
 *
 * Uso:
 *   pnpm cli auditoria:purge                 # default 12 meses
 *   pnpm cli auditoria:purge --dry           # solo cuenta
 *   pnpm cli auditoria:purge --meses 6       # cambia umbral
 *
 * Exit: 0 OK, 1 con errores.
 */

import { prisma } from '@pila/db';
import { ejecutarComoCronRun } from '../lib/cron-run.js';

export async function auditoriaPurgeCommand(options: {
  dry?: boolean;
  meses?: number;
}): Promise<void> {
  try {
    // Solo registramos el run en CronRun cuando NO es dry — los dry los
    // dispara el dev y son ruido en el histórico.
    if (options.dry) {
      await ejecutarPurga(options);
    } else {
      await ejecutarComoCronRun('auditoria-purge-monthly', async () => {
        const resumen = await ejecutarPurga(options);
        return { output: resumen };
      });
    }
    await prisma.$disconnect();
  } catch (err) {
    console.error(`❌ Error en purga: ${err instanceof Error ? err.message : 'desconocido'}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

async function ejecutarPurga(options: { dry?: boolean; meses?: number }): Promise<string> {
  const meses = Number.isFinite(options.meses) && (options.meses ?? 0) > 0 ? options.meses! : 12;
  const dry = Boolean(options.dry);
  const ahora = new Date();

  // Calculamos el límite restando `meses` meses calendario al "hoy" UTC.
  // Trabajamos en UTC para que el resultado sea estable independientemente
  // del huso del runner que ejecute el job.
  const limite = new Date(
    Date.UTC(
      ahora.getUTCFullYear(),
      ahora.getUTCMonth() - meses,
      ahora.getUTCDate(),
      ahora.getUTCHours(),
      ahora.getUTCMinutes(),
      ahora.getUTCSeconds(),
    ),
  );

  console.log(`\n🗑  Job de retención de bitácora — ${ahora.toISOString()}`);
  console.log(`   umbral: ${meses} meses (eventos antes de ${limite.toISOString()})`);
  if (dry) console.log(`   DRY RUN — solo cuenta, no borra\n`);
  else console.log('');

  const totalCandidatos = await prisma.auditLog.count({
    where: { createdAt: { lt: limite } },
  });

  console.log(`→ Eventos vencidos: ${totalCandidatos}`);

  if (totalCandidatos === 0) {
    console.log('✅ Nada que purgar. Tabla en buen estado.');
    return '0 eventos vencidos';
  }

  if (dry) {
    console.log(`✅ Dry run completo. ${totalCandidatos} eventos serían borrados.`);
    return `dry: ${totalCandidatos} candidatos`;
  }

  // Borramos en lotes para no saturar el connection pool con un solo
  // DELETE gigante, y para que el query log no se llene de nada raro.
  // 5000 es conservador — Postgres maneja MUCHO más, pero esto deja
  // margen si la tabla crece a millones de filas.
  const LOTE = 5000;
  let borradosTotal = 0;
  while (true) {
    const lote = await prisma.auditLog.findMany({
      where: { createdAt: { lt: limite } },
      select: { id: true },
      take: LOTE,
    });
    if (lote.length === 0) break;

    const r = await prisma.auditLog.deleteMany({
      where: { id: { in: lote.map((l) => l.id) } },
    });
    borradosTotal += r.count;
    console.log(`   · lote ${borradosTotal}/${totalCandidatos}...`);

    if (lote.length < LOTE) break; // último lote
  }

  console.log(`\n✅ Purga completa: ${borradosTotal} eventos eliminados.`);
  return `${borradosTotal} eventos eliminados (umbral ${meses} meses)`;
}
