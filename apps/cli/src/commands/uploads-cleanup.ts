/**
 * Cleanup de uploads huérfanos — borra archivos físicos en `UPLOADS_DIR`
 * que NO tienen un registro en BD que los referencie.
 *
 * Por qué pueden quedar huérfanos:
 *   1. Un upload falló a mitad (multipart aborted) y dejó el archivo
 *      pero la fila Prisma no se creó.
 *   2. Una incapacidad/soporte-af se anuló (delete cascade) — la fila
 *      desaparece pero el archivo físico se queda.
 *   3. Tests/seeds que generaron archivos sin limpiar.
 *
 * Estrategia: lista TODOS los archivos en uploads y los compara contra
 * los `archivoPath` referenciados en BD. Lo que sobra → borrar.
 *
 * Defensas:
 *   - Path traversal: cada archivo se resuelve absoluto y se verifica
 *     que arranque en el raíz de uploads. Si no, se salta (no borrar
 *     archivos fuera del directorio).
 *   - Edad mínima: solo se considera huérfano si tiene >24h. Esto
 *     evita race conditions con uploads en curso (un archivo recién
 *     creado puede no tener su fila aún si la BD está laggeada).
 *
 * Uso:
 *   pnpm cli uploads:cleanup                 # ejecuta y borra
 *   pnpm cli uploads:cleanup --dry           # solo cuenta y lista
 *   pnpm cli uploads:cleanup --min-edad-h 6  # baja la edad mínima
 */

import { readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prisma } from '@pila/db';
import { ejecutarComoCronRun } from '../lib/cron-run.js';

function uploadsRoot(): string {
  return resolve(process.env.UPLOADS_DIR ?? './uploads');
}

/**
 * Walk recursivo del directorio de uploads. Devuelve paths RELATIVOS al
 * raíz (la BD los guarda relativos para portabilidad).
 */
async function listarArchivosFisicos(root: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dirAbs: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dirAbs, { withFileTypes: true });
    } catch (err) {
      // Directorio no existe → nada que hacer (la app no había subido nada todavía).
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      const abs = join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        // Path relativo al root, normalizado a forward slashes (consistente
        // con cómo lo guarda el helper de storage).
        const rel = abs.slice(root.length + 1).replace(/\\/g, '/');
        out.push(rel);
      }
    }
  }

  await walk(root);
  return out;
}

async function listarArchivosReferenciados(): Promise<Set<string>> {
  // Tomamos solo los que NO están marcados como eliminados — los
  // eliminados ya pasaron por el job de retención y los archivos físicos
  // de esos pueden o no existir (es OK borrar los que sobran).
  const [incaps, soportes] = await Promise.all([
    prisma.incapacidadDocumento.findMany({
      where: { eliminado: false },
      select: { archivoPath: true },
    }),
    prisma.soporteAfDocumento.findMany({
      where: { eliminado: false },
      select: { archivoPath: true },
    }),
  ]);

  const set = new Set<string>();
  for (const r of incaps) set.add(r.archivoPath);
  for (const r of soportes) set.add(r.archivoPath);
  return set;
}

async function ejecutarCleanup(options: { dry?: boolean; minEdadHoras?: number }): Promise<string> {
  const root = uploadsRoot();
  const dry = Boolean(options.dry);
  const minEdadH =
    Number.isFinite(options.minEdadHoras) && (options.minEdadHoras ?? 0) > 0
      ? options.minEdadHoras!
      : 24;
  const ahora = Date.now();
  const minEdadMs = minEdadH * 60 * 60 * 1000;

  console.log(`\n🧹 Cleanup de uploads huérfanos — ${new Date(ahora).toISOString()}`);
  console.log(`   raíz: ${root}`);
  console.log(`   edad mínima: ${minEdadH}h${dry ? '   (DRY RUN)' : ''}\n`);

  const [fisicos, referenciados] = await Promise.all([
    listarArchivosFisicos(root),
    listarArchivosReferenciados(),
  ]);

  console.log(`→ Archivos físicos:        ${fisicos.length}`);
  console.log(`→ Referenciados en BD:     ${referenciados.size}`);

  // Identificar candidatos a borrar (no referenciados, suficientemente viejos).
  const candidatos: Array<{ rel: string; abs: string; edadH: number }> = [];
  for (const rel of fisicos) {
    if (referenciados.has(rel)) continue;
    const abs = resolve(join(root, rel));
    // Defensa contra path traversal — si el archivo terminó fuera del root
    // (no debería pasar pero por seguridad), saltamos.
    if (!abs.startsWith(root)) {
      console.warn(`   ⚠  ruta fuera del raíz, salto: ${rel}`);
      continue;
    }
    try {
      const s = await stat(abs);
      const edadH = (ahora - s.mtimeMs) / (60 * 60 * 1000);
      if (s.mtimeMs > ahora - minEdadMs) {
        // Demasiado nuevo — puede ser upload en curso.
        continue;
      }
      candidatos.push({ rel, abs, edadH });
    } catch {
      // Archivo desapareció entre el listado y el stat — race normal.
    }
  }

  console.log(`→ Huérfanos candidatos:    ${candidatos.length}`);

  if (candidatos.length === 0) {
    console.log('\n✅ Nada que limpiar. Directorio en buen estado.');
    return `0 huérfanos · ${fisicos.length} físicos · ${referenciados.size} en BD`;
  }

  if (dry) {
    console.log(`\n📋 Lista (primeros 20):`);
    candidatos.slice(0, 20).forEach((c) => {
      console.log(`   · ${c.rel}  (${c.edadH.toFixed(1)}h)`);
    });
    if (candidatos.length > 20) {
      console.log(`   ... y ${candidatos.length - 20} más`);
    }
    console.log(`\n✅ Dry run completo. ${candidatos.length} archivos serían borrados.`);
    return `dry: ${candidatos.length} huérfanos`;
  }

  let borrados = 0;
  let errores = 0;
  for (const c of candidatos) {
    try {
      await unlink(c.abs);
      borrados++;
    } catch (err) {
      // ENOENT = ya estaba borrado, OK silencioso.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        errores++;
        console.error(`   ❌ ${c.rel}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log(`\n✅ Cleanup completo: ${borrados} borrados, ${errores} errores.`);

  if (errores > 0) {
    throw new Error(`Cleanup completó con ${errores} errores (${borrados} borrados OK)`);
  }
  return `${borrados} archivos borrados (${fisicos.length} físicos, ${referenciados.size} en BD)`;
}

export async function uploadsCleanupCommand(options: {
  dry?: boolean;
  minEdadHoras?: number;
}): Promise<void> {
  try {
    if (options.dry) {
      await ejecutarCleanup(options);
    } else {
      await ejecutarComoCronRun('uploads-cleanup-weekly', async () => {
        return { output: await ejecutarCleanup(options) };
      });
    }
    await prisma.$disconnect();
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}
