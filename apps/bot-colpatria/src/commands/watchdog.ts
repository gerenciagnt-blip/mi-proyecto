import { prisma } from '@pila/db';
import { runWatchdog } from '../lib/watchdog.js';

/**
 * Comando standalone para correr el watchdog manualmente. Útil para:
 *   - Pruebas locales (`--dry-run` cuenta sin tocar BD).
 *   - Debug ad-hoc cuando un operador sospecha jobs colgados.
 *   - Cron dedicado si en algún momento se quiere correr más frecuente
 *     que `procesar` (ej: cada 5 min para revivir zombies más rápido).
 *
 * Por defecto, el watchdog ya corre al inicio de cada `procesar`, así
 * que este comando es complementario, no obligatorio.
 *
 * Uso:
 *   pnpm bot-colpatria watchdog --dry-run   # cuenta candidatos
 *   pnpm bot-colpatria watchdog             # ejecuta correcciones
 *   pnpm bot-colpatria watchdog --max-intentos 3   # cap más estricto
 */
export async function watchdogCommand(options: {
  dryRun?: boolean;
  maxIntentos?: number;
}): Promise<number> {
  const dryRun = options.dryRun ?? false;
  const maxIntentos = options.maxIntentos;

  console.log(
    `\n🐕 Bot Colpatria — watchdog${dryRun ? ' (DRY-RUN)' : ''}${
      maxIntentos != null ? ` · max-intentos=${maxIntentos}` : ''
    }\n`,
  );

  const inicio = Date.now();
  const r = await runWatchdog({ dryRun, maxIntentos });
  const dur = ((Date.now() - inicio) / 1000).toFixed(2);

  console.log('Resultados:');
  console.log(`   • Jobs zombies revividos:  ${r.zombies}`);
  console.log(`   • RETRYABLE → PENDING:     ${r.reciclados}`);
  console.log(`   • FAILED por max intentos: ${r.agotados}`);
  console.log(`   • Ventana fallos (${r.ventanaMin}min): ${r.fallosVentana}/${r.totalVentana}`);
  if (r.totalVentana >= 5) {
    console.log(`     → tasa de fallo: ${(r.tasaFallo * 100).toFixed(0)}%`);
  }
  console.log(`\n⏱  ${dur}s\n`);

  await prisma.$disconnect();
  // Exit code: 0 si todo bien, 1 si hubo agotados o tasa anormal (señal
  // operacional para que el cron del workflow alerte si quiere).
  const tasaAnormal = r.totalVentana >= 5 && r.tasaFallo > 0.5;
  return r.agotados > 0 || tasaAnormal ? 1 : 0;
}
