import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prisma } from '@pila/db';
import { createLogger } from '../lib/logger.js';

const log = createLogger('limpiar-pdfs');

/**
 * Borra del filesystem los PDFs de comprobante que pasaron del TTL
 * configurado (default 3 días). Conserva el registro en BD —
 * solo marca `pdfArchivedAt` con el timestamp del borrado.
 *
 * Política decidida con el operador: 3 días basta para que el
 * aliado verifique el comprobante; después se considera evidencia
 * histórica y libera espacio en disco.
 *
 * El cron diario en GH Actions invoca este comando. Es idempotente —
 * correrlo varias veces el mismo día no borra cosas más allá del TTL.
 *
 * Volumen estimado: 1500-2100 jobs/mes × 3 días retención ≈ 200 PDFs
 * en disco simultáneamente, mucho menos que sin retención (~6000+).
 *
 * Exit codes:
 *   0 → limpieza exitosa (incluso si no había nada que borrar)
 *   1 → error parcial (algunos archivos fallaron, otros OK)
 *   2 → error fatal antes de poder iterar
 */
export async function limpiarPdfsCommand(options: {
  dias: number;
  /** Modo dry-run: solo lista qué borraría, sin tocar nada. */
  dryRun?: boolean;
}): Promise<number> {
  const inicio = Date.now();
  const dias = Math.max(1, Math.floor(options.dias));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - dias);

  log.info({ dias, cutoff, dryRun: options.dryRun }, 'iniciando limpieza de PDFs');
  console.log(
    `\n🧹 Limpieza PDFs Colpatria${options.dryRun ? ' (DRY-RUN)' : ''} · TTL=${dias} días · cutoff=${cutoff.toISOString().slice(0, 10)}\n`,
  );

  const root = resolve(process.env.UPLOADS_DIR ?? './uploads');

  // Buscar jobs candidatos: SUCCESS, con pdfPath, NO archivados aún,
  // y cuya creación es anterior al cutoff. Limit alto pero defensivo.
  let candidatos: Array<{ id: string; pdfPath: string | null; createdAt: Date }>;
  try {
    candidatos = await prisma.colpatriaAfiliacionJob.findMany({
      where: {
        status: 'SUCCESS',
        pdfPath: { not: null },
        pdfArchivedAt: null,
        createdAt: { lt: cutoff },
      },
      select: { id: true, pdfPath: true, createdAt: true },
      take: 5000,
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : err }, 'falló query inicial');
    await prisma.$disconnect();
    return 2;
  }

  if (candidatos.length === 0) {
    console.log('✅ Nada que borrar — todo está dentro del TTL.');
    await prisma.$disconnect();
    return 0;
  }

  console.log(`📦 ${candidatos.length} PDF(s) candidatos para borrar\n`);

  let borrados = 0;
  let yaInexistentes = 0;
  let errores = 0;

  for (const job of candidatos) {
    if (!job.pdfPath) continue;
    if (job.pdfPath.includes('..')) {
      log.warn({ jobId: job.id }, 'path traversal detectado, omitiendo');
      errores++;
      continue;
    }
    const abs = resolve(join(root, job.pdfPath));
    if (!abs.startsWith(root)) {
      log.warn({ jobId: job.id }, 'path fuera de root, omitiendo');
      errores++;
      continue;
    }

    if (options.dryRun) {
      console.log(`   · [DRY] borraría: ${job.pdfPath}`);
      continue;
    }

    try {
      await unlink(abs);
      borrados++;
    } catch (err) {
      // ENOENT = ya no existe en disco (raro pero posible si alguien
      // borró manualmente). Lo marcamos archivado igual.
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        yaInexistentes++;
      } else {
        log.warn(
          { jobId: job.id, err: err instanceof Error ? err.message : String(err) },
          'falló unlink',
        );
        errores++;
        continue;
      }
    }

    // Persistir en BD el archivado (incluso si el archivo no existía)
    try {
      await prisma.colpatriaAfiliacionJob.update({
        where: { id: job.id },
        data: { pdfArchivedAt: new Date() },
      });
    } catch (err) {
      log.warn(
        { jobId: job.id, err: err instanceof Error ? err.message : err },
        'falló update BD tras borrar',
      );
      errores++;
    }
  }

  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(
    `\n📊 Resumen: ${borrados} borrados · ${yaInexistentes} ya inexistentes · ${errores} errores · ${dur}s\n`,
  );

  await prisma.$disconnect();
  return errores > 0 ? 1 : 0;
}
