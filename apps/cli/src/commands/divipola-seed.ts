/**
 * Comando `divipola:seed` — carga la lista oficial DANE de departamentos
 * y municipios de Colombia (DIVIPOLA, ~1122 registros).
 *
 * Idempotente:
 *   - Departamentos: upsert por `codigo`. Conserva los `id` ya cargados.
 *   - Municipios: upsert por `codigo`. No borra ninguno existente.
 *
 * Fuente del dataset: datos.gov.co (DANE), copiado a
 *   packages/db/data/divipola-dane.json
 *
 * Uso:
 *   pnpm cli divipola:seed
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '@pila/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type Row = {
  cod_dpto: string;
  dpto: string;
  cod_mpio: string;
  nom_mpio: string;
  tipo_municipio: string;
};

/** Convierte "MEDELLÍN" → "Medellín" (Title Case respetando tildes). */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-)/) // mantener separadores
    .map((tok) => (/^[a-záéíóúñü]+$/.test(tok) ? tok[0]!.toUpperCase() + tok.slice(1) : tok))
    .join('');
}

/** Algunos nombres "raros" del DANE — limpieza ligera. */
function normalizarNombre(raw: string): string {
  let s = raw.trim();
  // Reemplazar (CD) (PNN) etc. al final
  s = s.replace(/\s*\([^)]+\)\s*$/, '').trim();
  return titleCase(s);
}

export async function divipolaSeedCommand(): Promise<void> {
  console.log('\n🗺  DIVIPOLA · seed\n');

  const file = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'packages',
    'db',
    'data',
    'divipola-dane.json',
  );
  let rows: Row[];
  try {
    const raw = readFileSync(file, 'utf-8');
    rows = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ No pude leer ${file}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`→ Dataset cargado: ${rows.length} registros`);

  // Step 1: deptos únicos
  const deptosMap = new Map<string, { codigo: string; nombre: string }>();
  for (const r of rows) {
    if (!deptosMap.has(r.cod_dpto)) {
      deptosMap.set(r.cod_dpto, {
        codigo: r.cod_dpto,
        nombre: normalizarNombre(r.dpto),
      });
    }
  }
  console.log(`→ ${deptosMap.size} departamentos únicos`);

  // Step 2: upsert deptos. Para conservar ids previos, hacemos upsert
  // por `codigo` (campo único). Si no existe, se crea con cuid.
  let dCreados = 0;
  let dActualizados = 0;
  const deptoIdByCodigo = new Map<string, string>();
  for (const d of deptosMap.values()) {
    const existing = await prisma.departamento.findUnique({
      where: { codigo: d.codigo },
      select: { id: true, nombre: true },
    });
    if (existing) {
      deptoIdByCodigo.set(d.codigo, existing.id);
      if (existing.nombre !== d.nombre) {
        await prisma.departamento.update({
          where: { codigo: d.codigo },
          data: { nombre: d.nombre },
        });
        dActualizados++;
      }
    } else {
      const created = await prisma.departamento.create({
        data: { codigo: d.codigo, nombre: d.nombre },
      });
      deptoIdByCodigo.set(d.codigo, created.id);
      dCreados++;
    }
  }
  console.log(`   ✓ deptos: ${dCreados} creados, ${dActualizados} actualizados`);

  // Step 3: upsert municipios. Clave única = codigo (5 dígitos).
  // Para minimizar carga: por chunks.
  let mCreados = 0;
  let mActualizados = 0;
  let mSinDepto = 0;
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (r) => {
        const departamentoId = deptoIdByCodigo.get(r.cod_dpto);
        if (!departamentoId) {
          mSinDepto++;
          return;
        }
        const nombre = normalizarNombre(r.nom_mpio);
        const existing = await prisma.municipio.findUnique({
          where: { codigo: r.cod_mpio },
          select: { id: true, nombre: true, departamentoId: true },
        });
        if (existing) {
          // Si el nombre o el depto cambiaron, actualizar
          if (existing.nombre !== nombre || existing.departamentoId !== departamentoId) {
            await prisma.municipio.update({
              where: { codigo: r.cod_mpio },
              data: { nombre, departamentoId },
            });
            mActualizados++;
          }
        } else {
          await prisma.municipio.create({
            data: { codigo: r.cod_mpio, nombre, departamentoId },
          });
          mCreados++;
        }
      }),
    );
    if ((i / CHUNK) % 5 === 0) {
      process.stdout.write(
        `\r   procesando municipios ${Math.min(i + CHUNK, rows.length)}/${rows.length}`,
      );
    }
  }
  console.log(
    `\n   ✓ municipios: ${mCreados} creados, ${mActualizados} actualizados${mSinDepto > 0 ? `, ${mSinDepto} sin depto` : ''}`,
  );

  // Step 4: stats finales
  const totalD = await prisma.departamento.count();
  const totalM = await prisma.municipio.count();
  console.log(`\n📊 Total en BD: ${totalD} departamentos · ${totalM} municipios`);

  await prisma.$disconnect();
}
