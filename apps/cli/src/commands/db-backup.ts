/**
 * Comando `db:backup` — backup local de la BD a un archivo .dump.
 *
 * Útil para:
 *   - Hacer un backup ad-hoc antes de una migración riesgosa.
 *   - Probar localmente que el flujo de pg_dump funciona contra Neon.
 *   - Crear dumps que se subirán manualmente a S3 (o a otro storage).
 *
 * Requiere `pg_dump` instalado en el PATH (Postgres 16+ recomendado).
 *
 * Uso:
 *   pnpm cli db:backup                       # genera ./backups/<stamp>.dump
 *   pnpm cli db:backup --out /tmp/mi.dump
 *   pnpm cli db:backup --schema-only         # solo estructura (sin datos)
 *
 * El backup automático semanal vive en `.github/workflows/db-backup.yml`
 * y sube directo a S3. Este script es para casos manuales.
 */

import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export type DbBackupOptions = {
  out?: string;
  schemaOnly?: boolean;
};

function timestampStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export async function dbBackupCommand(opts: DbBackupOptions): Promise<void> {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    console.error('❌ DATABASE_URL no está configurado en el entorno.');
    process.exit(1);
  }

  const stamp = timestampStamp();
  const outPath = resolve(opts.out ?? `./backups/${stamp}.dump`);
  await mkdir(dirname(outPath), { recursive: true });

  console.log(`💾 pg_dump → ${outPath}`);
  if (opts.schemaOnly) console.log('   (solo schema, sin datos)');

  const args = [dbUrl, '-Fc', '-Z', '9', '--no-owner', '--no-privileges', '--file', outPath];
  if (opts.schemaOnly) args.push('--schema-only');

  try {
    const t0 = Date.now();
    await execFileP('pg_dump', args, { maxBuffer: 1024 * 1024 * 1024 });
    const ms = Date.now() - t0;
    const st = await stat(outPath);
    const mb = (st.size / 1024 / 1024).toFixed(2);
    console.log(`✅ Backup OK — ${mb} MB en ${(ms / 1000).toFixed(1)}s`);
    console.log('');
    console.log('Para restaurar:');
    console.log(`   pg_restore --no-owner --no-privileges -d $DATABASE_URL ${outPath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT')) {
      console.error('❌ pg_dump no está instalado. Instalá Postgres client 16+:');
      console.error('   - Windows: https://www.postgresql.org/download/windows/');
      console.error('   - macOS:   brew install libpq && brew link --force libpq');
      console.error('   - Linux:   sudo apt-get install postgresql-client-16');
    } else {
      console.error(`❌ pg_dump falló: ${msg}`);
    }
    process.exit(1);
  }
}
