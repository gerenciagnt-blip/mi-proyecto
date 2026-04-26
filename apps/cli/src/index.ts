#!/usr/bin/env node
import { Command } from 'commander';
import { APP_NAME, APP_VERSION } from '@pila/core';
import { adminCreateCommand } from './commands/admin-create.js';
import { resetPasswordCommand } from './commands/reset-password.js';
import { retentionRunCommand } from './commands/retention-run.js';
import { auditoriaPurgeCommand } from './commands/auditoria-purge.js';
import { seedTestDataCommand } from './commands/seed-test-data.js';
import { cobrosGenerarCommand, cobrosBloquearMorososCommand } from './commands/cobros-run.js';
import { pagosimplePingCommand } from './commands/pagosimple-ping.js';
import { pagosimpleSyncPlanillasCommand } from './commands/pagosimple-sync-planillas.js';
import { divipolaSeedCommand } from './commands/divipola-seed.js';
import { entidadesPilaSeedCommand } from './commands/entidades-pila-seed.js';
import { dbBackupCommand } from './commands/db-backup.js';

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
  .command('auditoria:purge')
  .description('Purga registros de bitácora con más de N meses (default 12)')
  .option('--dry', 'Simula sin borrar (solo cuenta candidatos)')
  .option('--meses <n>', 'Umbral en meses (default 12)', (v) => (v ? parseInt(v, 10) : undefined))
  .action(async (options: { dry?: boolean; meses?: number }) => {
    await auditoriaPurgeCommand(options);
  });

program
  .command('seed:test-data')
  .description('Crea sucursal + aliado + empresa de prueba (idempotente)')
  .option('--force', 'Actualiza datos aunque existan')
  .action(async (options: { force?: boolean }) => {
    await seedTestDataCommand(options);
  });

program
  .command('cobros:generar')
  .description('Genera CobroAliado del período (default: mes anterior)')
  .option('--periodo <yyyy-mm>', 'Período explícito (ej. 2026-03)')
  .action(async (options: { periodo?: string }) => {
    await cobrosGenerarCommand(options);
  });

program
  .command('cobros:bloquear-morosos')
  .description('Marca VENCIDO y bloquea sucursales con cobros fuera de plazo')
  .action(async () => {
    await cobrosBloquearMorososCommand();
  });

program
  .command('pagosimple:ping')
  .description('Verifica credenciales del usuario master de PagoSimple (login + auth_token)')
  .action(async () => {
    await pagosimplePingCommand();
  });

program
  .command('divipola:seed')
  .description('Carga la lista oficial DANE de departamentos + municipios (idempotente)')
  .action(async () => {
    await divipolaSeedCommand();
  });

program
  .command('entidades-pila:seed')
  .description('Carga el catálogo oficial de Administradoras PILA (EPS/AFP/ARL/CCF) desde Excel')
  .action(async () => {
    await entidadesPilaSeedCommand();
  });

program
  .command('pagosimple:sync-planillas')
  .description(
    'Re-consulta inconsistencias en PagoSimple para planillas CONSOLIDADO y actualiza el estado local',
  )
  .option('--include-pagadas', 'Incluir también planillas PAGADA')
  .action(async (options: { includePagadas?: boolean }) => {
    await pagosimpleSyncPlanillasCommand({ includePagadas: options.includePagadas });
  });

program
  .command('db:backup')
  .description('Genera un backup local de la BD (formato custom de pg_dump)')
  .option('--out <ruta>', 'Ruta del archivo de salida (default: ./backups/<stamp>.dump)')
  .option('--schema-only', 'Solo estructura, sin datos')
  .action(async (options: { out?: string; schemaOnly?: boolean }) => {
    await dbBackupCommand(options);
  });

// Filtra el '--' que pnpm-filter-run inyecta entre el script y los args
// reales cuando se ejecuta vía `pnpm cli <comando>`. Sin esto, commander v13
// lo ve como argumento posicional y falla con "too many arguments".
const argv = process.argv.filter((a, i) => !(i >= 2 && a === '--'));
program.parseAsync(argv);
