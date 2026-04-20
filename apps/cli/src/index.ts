#!/usr/bin/env node
import { Command } from 'commander';
import { APP_NAME, APP_VERSION } from '@pila/core';
import { adminCreateCommand } from './commands/admin-create.js';
import { resetPasswordCommand } from './commands/reset-password.js';

const program = new Command();

program
  .name('pila')
  .description(`CLI de administración — ${APP_NAME}`)
  .version(APP_VERSION);

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

program.parseAsync();
