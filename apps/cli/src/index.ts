#!/usr/bin/env node
import { Command } from 'commander';
import { APP_NAME, APP_VERSION } from '@pila/core';
import { adminCreateCommand } from './commands/admin-create.js';
import { resetPasswordCommand } from './commands/reset-password.js';
import { retentionRunCommand } from './commands/retention-run.js';
import { seedTestDataCommand } from './commands/seed-test-data.js';

const program = new Command();

program.name('pila').description(`CLI de administración — ${APP_NAME}`).version(APP_VERSION);

program
  .command('ping')
  .description('Verifica que la CLI está viva')
  .action(() => {
    console.log(`✅ ${APP_NAME} CLI v${APP_VERSION} — OK`);
  });

program
  .command('admin:create')
  .description('Crea un usuario administrador (interactivo)')
  .action(async () => {
    try {
      await adminCreateCommand();
    } catch (err) {
      if (err instanceof Error && err.name === 'ExitPromptError') {
        console.log('\n↩  Cancelado');
        process.exit(130);
      }
      throw err;
    }
  });

program
  .command('admin:reset-password')
  .description('Resetea la contraseña de un usuario por email (interactivo)')
  .action(async () => {
    try {
      await resetPasswordCommand();
    } catch (err) {
      if (err instanceof Error && err.name === 'ExitPromptError') {
        console.log('\n↩  Cancelado');
        process.exit(130);
      }
      throw err;
    }
  });

program
  .command('retention:run')
  .description('Ejecuta el job de retención 120d (incapacidades + soporte-af)')
  .option('--dry', 'Simula sin borrar archivos (solo cuenta)')
  .option('--module <modulo>', 'Solo ejecuta un módulo (incapacidades | soporte-af | all)', 'all')
  .action(async (options: { dry?: boolean; module?: string }) => {
    await retentionRunCommand(options);
  });

program
  .command('seed:test-data')
  .description('Crea sucursal + aliado + empresa de prueba (idempotente)')
  .option('--force', 'Actualiza datos aunque existan')
  .action(async (options: { force?: boolean }) => {
    await seedTestDataCommand(options);
  });

// Filtra el '--' que pnpm-filter-run inyecta entre el script y los args
// reales cuando se ejecuta vía `pnpm cli <comando>`. Sin esto, commander v13
// lo ve como argumento posicional y falla con "too many arguments".
const argv = process.argv.filter((a, i) => !(i >= 2 && a === '--'));
program.parseAsync(argv);
