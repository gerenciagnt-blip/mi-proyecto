#!/usr/bin/env node
import { Command } from 'commander';
import { APP_NAME, APP_VERSION } from '@pila/core';
import { testLoginCommand } from './commands/test-login.js';
import { testIngresoCommand } from './commands/test-ingreso.js';
import { procesarCommand } from './commands/procesar.js';
import { limpiarPdfsCommand } from './commands/limpiar-pdfs.js';
import { loginAutoCommand } from './commands/login-auto.js';
import { logoutAutoCommand } from './commands/logout-auto.js';
import { captureError, flushSentry } from './lib/sentry.js';
import { createLogger } from './lib/logger.js';

const cliLog = createLogger('cli');

/**
 * Wrappea la ejecución de un comando con captura Sentry + flush.
 *
 * Por qué hace falta:
 *   - El bot corre en GH Actions runners que se apagan apenas el proceso
 *     termina. Sin `flushSentry`, los eventos pendientes (capturados al
 *     final del run) no llegan a sentry.io.
 *   - Una excepción no manejada arriba en el callstack saltea el catch
 *     normal del comando — este wrapper la atrapa como red de seguridad.
 *
 * El callback retorna un exit code; si tira, capturamos y exit 1.
 */
async function runWithSentry(name: string, fn: () => Promise<number>): Promise<never> {
  let code = 1;
  try {
    code = await fn();
  } catch (err) {
    cliLog.fatal({ err, comando: name }, 'comando falló con excepción no manejada');
    await captureError(err, { scope: 'bot-cli', comando: name });
    code = 1;
  } finally {
    await flushSentry();
  }
  process.exit(code);
}

const program = new Command();

program
  .name('bot-colpatria')
  .description(`Bot RPA Colpatria ARL — ${APP_NAME}`)
  .version(APP_VERSION);

/**
 * Pruebas el login y la selección de perfil para UNA empresa contra el
 * portal real, sin tocar jobs ni registros. Ideal para validar que las
 * credenciales y los selectores AXA configurados en
 * /admin/empresas/[id]/colpatria son correctos.
 *
 * Uso:
 *   pnpm --filter @pila/bot-colpatria test-login --empresa-id=clxxx
 *   COLPATRIA_HEADLESS=false pnpm bot-colpatria test-login --empresa-id=clxxx  # ver browser
 */
program
  .command('test-login')
  .description('Prueba el login + paso /Bienvenida para una empresa')
  .requiredOption('--empresa-id <id>', 'ID de la empresa en BD')
  .option('--screenshot <path>', 'Guarda screenshot del estado final', './test-login.png')
  .option('--keep-open', 'Mantiene el browser abierto al terminar (para inspeccionar)')
  .action(async (options: { empresaId: string; screenshot?: string; keepOpen?: boolean }) => {
    await runWithSentry('test-login', () => testLoginCommand(options));
  });

/**
 * Prueba el flujo completo de Ingreso Individual contra el portal real
 * para UN job o UNA afiliación. NO modifica el job en BD — es debug
 * end-to-end.
 *
 * Uso (job real):
 *   pnpm bot-colpatria test-ingreso --empresa-id <id> --job-id <jobId>
 *
 * Uso (afiliación sintética, antes de que se dispare el job):
 *   pnpm bot-colpatria test-ingreso --empresa-id <id> --afiliacion-id <afId> \
 *       --eps-codigo-axa 1 --afp-codigo-axa 2
 */
program
  .command('test-ingreso')
  .description('Prueba el llenado del form Ingreso Individual end-to-end')
  .requiredOption('--empresa-id <id>', 'ID de la empresa en BD')
  .option('--job-id <id>', 'ID del job ColpatriaAfiliacionJob (preferido)')
  .option('--afiliacion-id <id>', 'UUID de la afiliación (construye payload on-the-fly)')
  .option(
    '--documento <numDoc>',
    'Número de documento del cotizante — busca afiliación ACTIVA en la empresa',
  )
  .option('--eps-codigo-axa <code>', 'Código AXA de la EPS (provisional, hasta extender payload)')
  .option('--afp-codigo-axa <code>', 'Código AXA de la AFP (provisional, hasta extender payload)')
  .option('--screenshot <path>', 'Guarda screenshot del estado final', './test-ingreso.png')
  .option('--keep-open', 'Mantiene el browser abierto al terminar')
  .action(
    async (options: {
      empresaId: string;
      jobId?: string;
      afiliacionId?: string;
      documento?: string;
      epsCodigoAxa?: string;
      afpCodigoAxa?: string;
      screenshot?: string;
      keepOpen?: boolean;
    }) => {
      await runWithSentry('test-ingreso', () => testIngresoCommand(options));
    },
  );

/**
 * Procesa N jobs PENDING. En Sprint 8.3 solo hace el login y deja el
 * job marcado como RETRYABLE con output explicativo (el llenado del
 * form viene en Sprint 8.4).
 */
program
  .command('procesar')
  .description('Procesa jobs Colpatria PENDING (login + nav + placeholder)')
  .option('--limite <n>', 'Máximo de jobs a procesar en esta corrida', '20')
  .option('--empresa-id <id>', 'Procesa solo jobs de esta empresa (debug)')
  .action(async (options: { limite?: string; empresaId?: string }) => {
    const limite = parseInt(options.limite ?? '20', 10) || 20;
    await runWithSentry('procesar', () =>
      procesarCommand({ limite, empresaId: options.empresaId }),
    );
  });

/**
 * Sprint 8.5.C — limpieza de PDFs viejos (TTL retención).
 * Borra del filesystem los PDFs de comprobante con más de N días,
 * conserva el registro en BD marcando `pdfArchivedAt`. Pensado para
 * correr como cron diario en GH Actions.
 *
 * Uso:
 *   pnpm bot-colpatria limpiar-pdfs --dias 3
 *   pnpm bot-colpatria limpiar-pdfs --dias 3 --dry-run
 */
program
  .command('limpiar-pdfs')
  .description('Borra PDFs de comprobante con más de N días (default 3)')
  .option('--dias <n>', 'Días de retención del PDF en disco', '3')
  .option('--dry-run', 'Solo lista qué borraría, sin tocar nada')
  .action(async (options: { dias?: string; dryRun?: boolean }) => {
    const dias = parseInt(options.dias ?? '3', 10) || 3;
    await runWithSentry('limpiar-pdfs', () => limpiarPdfsCommand({ dias, dryRun: options.dryRun }));
  });

/**
 * Login automático en cron — Lun–Sáb 7:00 AM Colombia.
 * Itera todas las empresas con `colpatriaActivo=true` y selectores
 * completos, hace login fresco y guarda el storageState en
 * `ColpatriaSesion`. Sin args.
 */
program
  .command('login-auto')
  .description('Login automático de TODAS las empresas Colpatria activas (cron Lun–Sáb 7 AM)')
  .action(async () => {
    await runWithSentry('login-auto', () => loginAutoCommand());
  });

/**
 * Cierre automático en cron — Lun–Sáb 9:00 PM Colombia.
 * Borra el storageState cifrado de todas las sesiones activas. No
 * navega al portal. Sin args.
 */
program
  .command('logout-auto')
  .description('Cierre automático de sesiones cacheadas Colpatria (cron Lun–Sáb 9 PM)')
  .action(async () => {
    await runWithSentry('logout-auto', () => logoutAutoCommand());
  });

// Filtra el '--' que pnpm-filter-run inyecta entre el script y los args
// reales cuando se ejecuta vía `pnpm bot-colpatria <comando>`.
const argv = process.argv.filter((a, i) => !(i >= 2 && a === '--'));
program.parseAsync(argv);
