/**
 * Watchdog del bot Colpatria — auto-corrección preventiva de la cola de
 * jobs antes de procesar nuevos.
 *
 * Por qué hace falta:
 *
 *   1. **Jobs zombies (RUNNING + sin update por mucho tiempo)**: si el
 *      worker Playwright crashea entre `status='RUNNING'` y el update
 *      final a SUCCESS/FAILED/RETRYABLE, el job queda colgado para
 *      siempre. El SELECT FOR UPDATE SKIP LOCKED del proceso normal
 *      busca solo `PENDING`, así que nadie lo retoma.
 *
 *   2. **RETRYABLE no se reintenta automático**: el flujo actual mueve
 *      jobs a `RETRYABLE` ante errores transitorios pero NO hay job que
 *      los devuelva a `PENDING`. Sin watchdog, se quedan ahí hasta que
 *      el operador los toca a mano.
 *
 *   3. **Fallos masivos silenciosos**: si AXA cambia el HTML o las
 *      credenciales caducan, todos los jobs empiezan a fallar y nadie se
 *      entera hasta que un aliado llama a soporte.
 *
 * Las 3 funciones de este módulo son **idempotentes y baratas** (1-2
 * queries cada una). Se invocan al inicio de cada `procesar` antes de
 * tomar nuevos jobs PENDING. Costo total: ~50ms.
 *
 * Diseño expuesto:
 *   - Si SENTRY_DSN no está, las alertas son no-op (el watchdog corrige
 *     silenciosamente sin notificar).
 *   - Logs siempre se emiten con pino — los nivel error van a Sentry
 *     vía el hook del logger.
 *
 * Test manual:
 *   pnpm bot-colpatria watchdog --dry-run     # lista pero no toca BD
 *   pnpm bot-colpatria watchdog               # ejecuta
 */

import { prisma } from '@pila/db';
import { createLogger } from './logger.js';
import { captureMessage } from './sentry.js';

const log = createLogger('watchdog');

/**
 * Tiempo máximo que un job puede estar RUNNING antes de considerarse
 * zombie. 30 min es 2× el `timeout-minutes: 25` del workflow GH Actions —
 * si el runner aún corre, no lo toca; si murió mid-run, lo libera.
 */
const ZOMBIE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Máximo de intentos automáticos antes de marcar un RETRYABLE como
 * FAILED definitivo. Configurable vía env. 5 cubre la mayoría de
 * fallos transitorios (sesión expirada, AXA lento, captcha aleatorio).
 */
const MAX_INTENTOS_DEFAULT = 5;

/**
 * Ventana para detectar tasa anormal de fallos. 30 min = 2 ciclos del
 * cron de procesar. Suficiente para que un cambio en AXA dispare la
 * alerta sin que falsee con noise puntual.
 */
const VENTANA_FALLOS_MIN = 30;

export type WatchdogResult = {
  zombies: number;
  reciclados: number;
  agotados: number;
  ventanaMin: number;
  fallosVentana: number;
  totalVentana: number;
  tasaFallo: number;
};

/**
 * Ejecuta las 3 etapas del watchdog en orden. Devuelve un resumen para
 * que el caller (procesar / comando standalone) loguee al usuario.
 *
 * Si `dryRun=true`, NO escribe en BD — solo cuenta y reporta. Útil para
 * verificar antes de aplicar correcciones masivas.
 */
export async function runWatchdog(
  opts: {
    dryRun?: boolean;
    maxIntentos?: number;
  } = {},
): Promise<WatchdogResult> {
  const dryRun = opts.dryRun ?? false;
  const maxIntentos = opts.maxIntentos ?? MAX_INTENTOS_DEFAULT;

  const zombies = await revivirJobsZombies({ dryRun });
  const recicleResult = await reciclarRetryables({ dryRun, maxIntentos });
  const fallos = await alertarFallosMasivos();

  return {
    zombies,
    reciclados: recicleResult.reciclados,
    agotados: recicleResult.agotados,
    ventanaMin: VENTANA_FALLOS_MIN,
    fallosVentana: fallos.fallidos,
    totalVentana: fallos.totales,
    tasaFallo: fallos.tasa,
  };
}

/**
 * Encuentra jobs `RUNNING` cuyo `updatedAt < NOW - 30 min` y los marca
 * como `RETRYABLE` con un mensaje claro. El bot crashea (uncaughtException
 * de Playwright, OOM del runner, kill -9 de GH Actions por timeout) son
 * los casos típicos.
 *
 * El campo `updatedAt` se actualiza automáticamente con cada UPDATE
 * (Prisma `@updatedAt`), así que jobs que están progresando legítimamente
 * NO se tocan.
 */
async function revivirJobsZombies(opts: { dryRun: boolean }): Promise<number> {
  const cutoff = new Date(Date.now() - ZOMBIE_TIMEOUT_MS);

  if (opts.dryRun) {
    const candidatos = await prisma.colpatriaAfiliacionJob.count({
      where: { status: 'RUNNING', updatedAt: { lt: cutoff } },
    });
    if (candidatos > 0) {
      log.info({ candidatos, cutoff }, 'watchdog (dry-run): jobs zombies detectados');
    }
    return candidatos;
  }

  const result = await prisma.colpatriaAfiliacionJob.updateMany({
    where: { status: 'RUNNING', updatedAt: { lt: cutoff } },
    data: {
      status: 'RETRYABLE',
      error: `Watchdog: job revivido (RUNNING > ${ZOMBIE_TIMEOUT_MS / 60000} min sin progreso)`,
    },
  });

  if (result.count > 0) {
    // Se loguea como ERROR para que vaya a Sentry vía el hook del logger.
    // Es genuinamente anormal — el bot debería siempre cerrar sus jobs.
    log.error(
      { revividos: result.count, cutoff: cutoff.toISOString() },
      'watchdog: jobs zombies revividos',
    );
    await captureMessage(
      `Watchdog Colpatria: ${result.count} job(s) zombies revividos a RETRYABLE`,
      'warning',
      { revividos: result.count, cutoff: cutoff.toISOString(), zombieTimeoutMs: ZOMBIE_TIMEOUT_MS },
    );
  }
  return result.count;
}

/**
 * Mueve jobs RETRYABLE de vuelta a PENDING (con `intento += 1`) cuando
 * pasa el cooldown. Aplica backoff exponencial: 2^intento min, topeado
 * a 60 min. Cap en `maxIntentos` — pasado eso queda FAILED definitivo.
 *
 * Backoff sample (intento → cooldown):
 *   1 → 2 min
 *   2 → 4 min
 *   3 → 8 min
 *   4 → 16 min
 *   5 → 32 min
 *   6+ → 60 min (cap)
 *
 * Después de `maxIntentos` (5 default), el job se marca FAILED y NO se
 * reintenta más. El operador puede volverlo a encolar a mano si decide
 * que vale la pena (típicamente tras arreglar credenciales o config).
 */
async function reciclarRetryables(opts: {
  dryRun: boolean;
  maxIntentos: number;
}): Promise<{ reciclados: number; agotados: number }> {
  const candidatos = await prisma.colpatriaAfiliacionJob.findMany({
    where: { status: 'RETRYABLE' },
    select: { id: true, intento: true, finishedAt: true, error: true },
  });

  let reciclados = 0;
  let agotados = 0;

  for (const j of candidatos) {
    // Cap de intentos → FAILED definitivo.
    if (j.intento >= opts.maxIntentos) {
      if (!opts.dryRun) {
        await prisma.colpatriaAfiliacionJob.update({
          where: { id: j.id },
          data: {
            status: 'FAILED',
            error: `${j.error ?? '(sin mensaje previo)'} · Máximo de ${opts.maxIntentos} intentos excedido`,
          },
        });
      }
      agotados++;
      continue;
    }

    // Backoff exponencial: 2^intento min, cap 60 min.
    const cooldownMs = Math.min(60 * 60 * 1000, Math.pow(2, j.intento) * 60 * 1000);
    const elapsedMs = j.finishedAt ? Date.now() - j.finishedAt.getTime() : Infinity;
    if (elapsedMs < cooldownMs) continue; // todavía en cooldown

    if (!opts.dryRun) {
      await prisma.colpatriaAfiliacionJob.update({
        where: { id: j.id },
        data: {
          status: 'PENDING',
          intento: j.intento + 1,
          startedAt: null,
          finishedAt: null,
        },
      });
    }
    reciclados++;
  }

  if (reciclados > 0 || agotados > 0) {
    log.info(
      { reciclados, agotados, dryRun: opts.dryRun, maxIntentos: opts.maxIntentos },
      'watchdog: reciclaje de RETRYABLE',
    );
  }
  if (agotados > 0 && !opts.dryRun) {
    // Que el operador sepa para investigar — un job que agotó intentos
    // típicamente indica un problema sistémico (credenciales, AXA, etc.).
    await captureMessage(
      `Watchdog Colpatria: ${agotados} job(s) marcados FAILED por max intentos (${opts.maxIntentos})`,
      'warning',
      { agotados, maxIntentos: opts.maxIntentos },
    );
  }
  return { reciclados, agotados };
}

/**
 * Calcula la tasa de fallo en los últimos N minutos (default 30).
 * Si supera 50% Y hay al menos 5 jobs, dispara una alerta — esto
 * detecta cambios en AXA, credenciales caducas masivas, o incidentes
 * de infraestructura.
 *
 * Threshold de 5 jobs evita falsos positivos en horas valle.
 */
async function alertarFallosMasivos(): Promise<{
  totales: number;
  fallidos: number;
  tasa: number;
}> {
  const desde = new Date(Date.now() - VENTANA_FALLOS_MIN * 60 * 1000);
  const stats = await prisma.colpatriaAfiliacionJob.groupBy({
    by: ['status'],
    where: { finishedAt: { gte: desde } },
    _count: true,
  });

  const totales = stats.reduce((acc, s) => acc + s._count, 0);
  const fallidos = stats
    .filter((s) => s.status === 'FAILED' || s.status === 'RETRYABLE')
    .reduce((acc, s) => acc + s._count, 0);
  const tasa = totales > 0 ? fallidos / totales : 0;

  if (totales >= 5 && tasa > 0.5) {
    log.error(
      {
        totales,
        fallidos,
        tasa: Number(tasa.toFixed(2)),
        ventanaMin: VENTANA_FALLOS_MIN,
        breakdown: stats,
      },
      'watchdog: tasa de fallos anormal',
    );
    await captureMessage(
      `Watchdog Colpatria: tasa de fallos ${(tasa * 100).toFixed(0)}% en últimos ${VENTANA_FALLOS_MIN} min (${fallidos}/${totales})`,
      'error',
      {
        ventanaMin: VENTANA_FALLOS_MIN,
        totales,
        fallidos,
        breakdown: stats.map((s) => ({ status: s.status, count: s._count })),
      },
    );
  }
  return { totales, fallidos, tasa };
}
