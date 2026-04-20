#!/usr/bin/env node
import { Command } from 'commander';
import { APP_NAME, APP_VERSION } from '@pila/core';

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

// Los siguientes comandos se implementan en Fase 1:
program
  .command('seed')
  .description('Carga datos iniciales (roles, admin, parámetros) — TODO Fase 1')
  .action(() => {
    console.log('⏳ Por implementar en Fase 1');
  });

program
  .command('admin:create')
  .description('Crea un usuario administrador — TODO Fase 1')
  .action(() => {
    console.log('⏳ Por implementar en Fase 1');
  });

program.parse();
