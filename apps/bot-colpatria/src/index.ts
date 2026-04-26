#!/usr/bin/env node
import { Command } from 'commander';
import { APP_NAME, APP_VERSION } from '@pila/core';
import { testLoginCommand } from './commands/test-login.js';
import { procesarCommand } from './commands/procesar.js';

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
    const code = await testLoginCommand(options);
    process.exit(code);
  });

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
    const code = await procesarCommand({ limite, empresaId: options.empresaId });
    process.exit(code);
  });

// Filtra el '--' que pnpm-filter-run inyecta entre el script y los args
// reales cuando se ejecuta vía `pnpm bot-colpatria <comando>`.
const argv = process.argv.filter((a, i) => !(i >= 2 && a === '--'));
program.parseAsync(argv);
