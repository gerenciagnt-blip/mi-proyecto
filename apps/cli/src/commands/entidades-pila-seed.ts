/**
 * Comando `entidades-pila:seed` — carga el catálogo oficial de
 * Administradoras PILA (EPS, AFP, ARL, CCF) desde un Excel.
 *
 * Idempotente:
 *   1. Match por (tipo, NIT) — si el NIT existe, actualiza nombre +
 *      codigoMinSalud manteniendo el `codigo` interno.
 *   2. Si no, match por (tipo, codigoMinSalud) — actualiza nombre + nit.
 *   3. Si no existe → crea con `codigo` = codigoMinSalud (con desambiguación
 *      vía sufijo si choca el unique compuesto (tipo, codigo)).
 *
 * Las entidades preexistentes que NO estén en el Excel NO se borran ni
 * desactivan — quedan tal cual.
 *
 * Fuente: packages/db/data/entidades-pila-dane.xlsx
 *
 * Uso:
 *   pnpm cli entidades-pila:seed
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { prisma, type TipoEntidadSgss } from '@pila/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type Row = {
  Subsistema: string;
  Administradora: string;
  'Código PILA': string;
  NIT: string;
};

/** Convierte "AFP COLPENSIONES" → "AFP Colpensiones" (Title Case). */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((tok) => (/^[a-záéíóúñü]+$/.test(tok) ? tok[0]!.toUpperCase() + tok.slice(1) : tok))
    .join('');
}

const SUBSISTEMA_TO_TIPO: Record<string, TipoEntidadSgss> = {
  EPS: 'EPS',
  AFP: 'AFP',
  ARL: 'ARL',
  CCF: 'CCF',
};

export async function entidadesPilaSeedCommand(): Promise<void> {
  console.log('\n🏥 Entidades SGSS PILA · seed\n');

  const file = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'packages',
    'db',
    'data',
    'entidades-pila-dane.xlsx',
  );

  let rows: Row[];
  try {
    const buf = readFileSync(file);
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    rows = XLSX.utils.sheet_to_json(sheet!, { defval: '', raw: false }) as Row[];
  } catch (err) {
    console.error(`❌ No pude leer ${file}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`→ Excel cargado: ${rows.length} filas`);

  let creadas = 0;
  let actualizadas = 0;
  let omitidas = 0;
  let errores = 0;

  for (const r of rows) {
    const tipoRaw = String(r.Subsistema ?? '')
      .trim()
      .toUpperCase();
    const tipo = SUBSISTEMA_TO_TIPO[tipoRaw];
    if (!tipo) {
      console.warn(`   ⚠ Subsistema desconocido "${tipoRaw}", saltando`);
      omitidas++;
      continue;
    }
    const codigoMinSalud = String(r['Código PILA'] ?? '').trim();
    const nit = String(r.NIT ?? '').trim();
    const nombre = titleCase(String(r.Administradora ?? '').trim());

    if (!codigoMinSalud) {
      console.warn(`   ⚠ Sin código PILA — ${nombre}, saltando`);
      omitidas++;
      continue;
    }

    try {
      // 1) Buscar por NIT (más confiable)
      let existing =
        nit !== ''
          ? await prisma.entidadSgss.findFirst({
              where: { tipo, nit },
              select: { id: true, codigo: true },
            })
          : null;

      // 2) Si no, por codigoMinSalud
      if (!existing) {
        existing = await prisma.entidadSgss.findFirst({
          where: { tipo, codigoMinSalud },
          select: { id: true, codigo: true },
        });
      }

      if (existing) {
        await prisma.entidadSgss.update({
          where: { id: existing.id },
          data: {
            nombre,
            codigoMinSalud,
            nit: nit || null,
          },
        });
        actualizadas++;
        continue;
      }

      // 3) Crear nueva. Generamos un `codigo` único basado en codigoMinSalud
      //    (que ya suele ser único por tipo). Si choca, agregamos sufijo.
      let codigo = codigoMinSalud;
      let intento = 0;
      while (true) {
        const dup = await prisma.entidadSgss.findUnique({
          where: { tipo_codigo: { tipo, codigo } },
          select: { id: true },
        });
        if (!dup) break;
        intento++;
        codigo = `${codigoMinSalud}-${intento}`;
        if (intento > 10)
          throw new Error(`No pude generar un código único para ${tipo}/${codigoMinSalud}`);
      }

      await prisma.entidadSgss.create({
        data: {
          tipo,
          codigo,
          nombre,
          codigoMinSalud,
          nit: nit || null,
          active: true,
        },
      });
      creadas++;
    } catch (err) {
      errores++;
      console.error(
        `   ❌ ${tipo} ${codigoMinSalud} ${nombre}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(
    `\n   ✓ ${creadas} creadas · ${actualizadas} actualizadas · ${omitidas} omitidas · ${errores} errores`,
  );

  // Conteo final por tipo
  const porTipo = await prisma.entidadSgss.groupBy({
    by: ['tipo'],
    _count: { tipo: true },
  });
  console.log('\n📊 Total por tipo en BD:');
  for (const t of porTipo) {
    console.log(`   ${t.tipo}: ${t._count.tipo}`);
  }

  await prisma.$disconnect();
}
