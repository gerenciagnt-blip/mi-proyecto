/**
 * Job de retención por módulo. Cada categoría de adjunto tiene su propio
 * límite de días — vencidos los días, se borra el archivo físico del
 * disco y queda el registro en BD como evidencia (`eliminado=true`).
 *
 * Reglas vigentes:
 *   - incapacidades regulares (confidencial=false)         → 120 días
 *   - incapacidades del flujo jurídico (confidencial=true) → 180 días
 *     (plazos legales suelen tomar más tiempo y los DPP/tutelas
 *      sobreviven varios meses).
 *   - soporte-afiliaciones                                  → 120 días
 *   - reporte-at (FURAT y otros soportes operativos)        → 30 días
 *
 * Esta implementación duplica deliberadamente la lógica de los módulos
 * web (apps/web/src/lib/{...}/retencion.ts) para mantener el CLI
 * autosuficiente (no requiere importar desde apps/web, que es un
 * paquete Next y no está diseñado como lib consumible).
 *
 * Uso:
 *   pnpm cli retention:run                      # ejecuta todos los módulos
 *   pnpm cli retention:run --dry                # solo cuenta, no borra
 *   pnpm cli retention:run --module incapacidades
 *   pnpm cli retention:run --module soporte-af
 *   pnpm cli retention:run --module reporte-at
 *
 * Exit: 0 OK, 1 con errores.
 */

import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prisma } from '@pila/db';
import { ejecutarComoCronRun } from '../lib/cron-run.js';

/** Días de retención por bucket — explicit & central. */
const DIAS = {
  INCAPACIDAD_REGULAR: 120,
  /** Sprint Jurídico — confidenciales viven más tiempo por procesos legales en curso. */
  INCAPACIDAD_CONFIDENCIAL: 180,
  SOPORTE_AF: 120,
  REPORTE_AT: 30,
} as const;

type Modulo = 'incapacidades' | 'soporte-af' | 'reporte-at' | 'all';

type LimpiezaResultado = {
  evaluados: number;
  eliminados: number;
  errores: Array<{ documentoId: string; mensaje: string }>;
};

function uploadsRoot(): string {
  return resolve(process.env.UPLOADS_DIR ?? './uploads');
}

function diasAtras(ahora: Date, dias: number): Date {
  const limite = new Date(ahora);
  limite.setUTCDate(limite.getUTCDate() - dias);
  return limite;
}

async function limpiar(
  ahora: Date,
  dias: number,
  dry: boolean,
  finder: (limite: Date) => Promise<Array<{ id: string; archivoPath: string }>>,
  marker: (ids: string[], when: Date) => Promise<void>,
): Promise<LimpiezaResultado> {
  const limite = diasAtras(ahora, dias);
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
    options.module === 'incapacidades' ||
    options.module === 'soporte-af' ||
    options.module === 'reporte-at'
      ? options.module
      : 'all';
  const dry = Boolean(options.dry);
  const ahora = new Date();

  console.log(`\n🗑  Job de retención — ${ahora.toISOString()}`);
  console.log(`   módulo: ${modulo}${dry ? '   (DRY RUN)' : ''}\n`);

  let totalErrores = 0;

  if (modulo === 'incapacidades' || modulo === 'all') {
    // Dos buckets: regulares (120d) y confidenciales jurídico (180d).
    console.log(
      `→ Incapacidades · regulares ${DIAS.INCAPACIDAD_REGULAR}d / confidenciales ${DIAS.INCAPACIDAD_CONFIDENCIAL}d`,
    );

    const regulares = await limpiar(
      ahora,
      DIAS.INCAPACIDAD_REGULAR,
      dry,
      (limite) =>
        prisma.incapacidadDocumento.findMany({
          where: { eliminado: false, confidencial: false, createdAt: { lt: limite } },
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
    console.log('   regulares (120d):');
    reportResultado('     ', regulares);

    const confidenciales = await limpiar(
      ahora,
      DIAS.INCAPACIDAD_CONFIDENCIAL,
      dry,
      (limite) =>
        prisma.incapacidadDocumento.findMany({
          where: { eliminado: false, confidencial: true, createdAt: { lt: limite } },
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
    console.log('   confidenciales (180d):');
    reportResultado('     ', confidenciales);

    const consolidado: LimpiezaResultado = {
      evaluados: regulares.evaluados + confidenciales.evaluados,
      eliminados: regulares.eliminados + confidenciales.eliminados,
      errores: [...regulares.errores, ...confidenciales.errores],
    };
    totalErrores += consolidado.errores.length;
    onResultado?.('incapacidades', consolidado);
  }

  if (modulo === 'soporte-af' || modulo === 'all') {
    console.log(`→ Soporte · Afiliaciones (${DIAS.SOPORTE_AF}d)`);
    const res = await limpiar(
      ahora,
      DIAS.SOPORTE_AF,
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

  if (modulo === 'reporte-at' || modulo === 'all') {
    console.log(`→ Reporte AT · adjuntos (${DIAS.REPORTE_AT}d)`);
    const res = await limpiar(
      ahora,
      DIAS.REPORTE_AT,
      dry,
      (limite) =>
        prisma.reporteATDocumento.findMany({
          where: { eliminado: false, createdAt: { lt: limite } },
          select: { id: true, archivoPath: true },
        }),
      (ids, when) =>
        prisma.reporteATDocumento
          .updateMany({
            where: { id: { in: ids } },
            data: { eliminado: true, eliminadoEn: when },
          })
          .then(() => {}),
    );
    reportResultado('  ', res);
    totalErrores += res.errores.length;
    onResultado?.('reporte-at', res);
  }

  console.log('');
  if (totalErrores > 0) {
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
