/**
 * Job de retención 120 días — limpia archivos físicos de documentos con
 * más de 120 días (incapacidades y soporte-afiliaciones), conservando
 * el registro en BD como evidencia.
 *
 * Esta implementación duplica deliberadamente la lógica de los módulos
 * web (apps/web/src/lib/{incapacidades,soporte-af}/retencion.ts) para
 * mantener el CLI autosuficiente (no requiere importar desde apps/web,
 * que es un paquete Next y no está diseñado como lib consumible).
 *
 * Uso:
 *   pnpm cli retention:run                    # ejecuta ambos módulos
 *   pnpm cli retention:run --dry              # solo cuenta, no borra
 *   pnpm cli retention:run --module incapacidades
 *   pnpm cli retention:run --module soporte-af
 *
 * Exit: 0 OK, 1 con errores.
 */

import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prisma } from '@pila/db';
import { ejecutarComoCronRun } from '../lib/cron-run.js';

const DIAS_RETENCION = 120;

type Modulo = 'incapacidades' | 'soporte-af' | 'all';

type LimpiezaResultado = {
  evaluados: number;
  eliminados: number;
  errores: Array<{ documentoId: string; mensaje: string }>;
};

function uploadsRoot(): string {
  return resolve(process.env.UPLOADS_DIR ?? './uploads');
}

async function limpiar(
  ahora: Date,
  dry: boolean,
  finder: (limite: Date) => Promise<Array<{ id: string; archivoPath: string }>>,
  marker: (ids: string[], when: Date) => Promise<void>,
): Promise<LimpiezaResultado> {
  const limite = new Date(ahora);
  limite.setUTCDate(limite.getUTCDate() - DIAS_RETENCION);

  const vencidos = await finder(limite);
  if (dry) {
    return { evaluados: vencidos.length, eliminados: 0, errores: [] };
  }

  const root = uploadsRoot();
  const errores: LimpiezaResultado['errores'] = [];
  const eliminadosIds: string[] = [];

  for (const doc of vencidos) {
    const abs = resolve(join(root, doc.archivoPath));
    if (!abs.startsWith(root)) {
      errores.push({ documentoId: doc.id, mensaje: `Ruta fuera del raíz: ${doc.archivoPath}` });
      continue;
    }
    try {
      await unlink(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        errores.push({
          documentoId: doc.id,
          mensaje: err instanceof Error ? err.message : 'Error desconocido',
        });
        continue;
      }
    }
    eliminadosIds.push(doc.id);
  }

  if (eliminadosIds.length > 0) {
    await marker(eliminadosIds, new Date());
  }

  return { evaluados: vencidos.length, eliminados: eliminadosIds.length, errores };
}

export async function retentionRunCommand(options: {
  dry?: boolean;
  module?: string;
}): Promise<void> {
  const dry = Boolean(options.dry);
  try {
    // Sólo registramos en CronRun cuando NO es dry — los dry los dispara
    // el dev y son ruido en el histórico.
    if (dry) {
      await ejecutarRetention(options);
    } else {
      await ejecutarComoCronRun('retention-daily', async () => {
        return { output: await ejecutarRetentionConResumen(options) };
      });
    }
    await prisma.$disconnect();
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

async function ejecutarRetentionConResumen(options: {
  dry?: boolean;
  module?: string;
}): Promise<string> {
  const partes: string[] = [];
  await ejecutarRetention(options, (modulo, res) => {
    partes.push(`${modulo}: ${res.eliminados}/${res.evaluados}`);
  });
  return partes.join(' · ');
}

async function ejecutarRetention(
  options: { dry?: boolean; module?: string },
  onResultado?: (modulo: string, res: LimpiezaResultado) => void,
): Promise<void> {
  const modulo: Modulo =
    options.module === 'incapacidades' || options.module === 'soporte-af' ? options.module : 'all';
  const dry = Boolean(options.dry);
  const ahora = new Date();

  console.log(`\n🗑  Job de retención ${DIAS_RETENCION}d — ${ahora.toISOString()}`);
  console.log(`   módulo: ${modulo}${dry ? '   (DRY RUN)' : ''}\n`);

  let totalErrores = 0;

  if (modulo === 'incapacidades' || modulo === 'all') {
    console.log('→ Incapacidades');
    const res = await limpiar(
      ahora,
      dry,
      (limite) =>
        prisma.incapacidadDocumento.findMany({
          where: { eliminado: false, createdAt: { lt: limite } },
          select: { id: true, archivoPath: true },
        }),
      (ids, when) =>
        prisma.incapacidadDocumento
          .updateMany({
            where: { id: { in: ids } },
            data: { eliminado: true, eliminadoEn: when },
          })
          .then(() => {}),
    );
    reportResultado('  ', res);
    totalErrores += res.errores.length;
    onResultado?.('incapacidades', res);
  }

  if (modulo === 'soporte-af' || modulo === 'all') {
    console.log('→ Soporte · Afiliaciones');
    const res = await limpiar(
      ahora,
      dry,
      (limite) =>
        prisma.soporteAfDocumento.findMany({
          where: { eliminado: false, createdAt: { lt: limite } },
          select: { id: true, archivoPath: true },
        }),
      (ids, when) =>
        prisma.soporteAfDocumento
          .updateMany({
            where: { id: { in: ids } },
            data: { eliminado: true, eliminadoEn: when },
          })
          .then(() => {}),
    );
    reportResultado('  ', res);
    totalErrores += res.errores.length;
    onResultado?.('soporte-af', res);
  }

  console.log('');
  if (totalErrores > 0) {
    // Lanzamos para que el wrapper de CronRun marque el job como ERROR.
    // El CLI top-level captura y traduce a exit(1).
    throw new Error(`Retention completó con ${totalErrores} error(es)`);
  }
  console.log('✅ Completó sin errores.');
}

function reportResultado(prefix: string, r: LimpiezaResultado): void {
  console.log(`${prefix}evaluados:  ${r.evaluados}`);
  console.log(`${prefix}eliminados: ${r.eliminados}`);
  if (r.errores.length > 0) {
    console.log(`${prefix}errores:    ${r.errores.length}`);
    for (const e of r.errores.slice(0, 5)) {
      console.log(`${prefix}  - ${e.documentoId}: ${e.mensaje}`);
    }
    if (r.errores.length > 5) {
      console.log(`${prefix}  ... y ${r.errores.length - 5} más`);
    }
  }
}
