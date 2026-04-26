/**
 * Análisis de la base de datos para detectar oportunidades de optimización.
 *
 * Hace dos reportes:
 *
 *   1. **Top queries lentas/frecuentes** desde `pg_stat_statements` (si
 *      la extensión está disponible). Esta vista da el detalle más
 *      accionable: ranking de queries reales con tiempos. Algunos
 *      proveedores (Neon free, RDS sin opción) no la traen activa por
 *      default.
 *
 *   2. **Estadísticas de tablas e índices** desde `pg_stat_user_tables`
 *      y `pg_stat_user_indexes` (siempre disponibles). Permite detectar:
 *        - Tablas con muchos sequential scans (candidatos a índice nuevo)
 *        - Índices que nunca se usan (candidatos a borrar)
 *        - Crecimiento desigual de tablas
 *
 * Si pg_stat_statements no está disponible, solo se hace el reporte 2.
 *
 * Uso:
 *   pnpm cli analyze:db                    # ejecuta ambos reportes
 *   pnpm cli analyze:db --by mean          # top queries por promedio
 *   pnpm cli analyze:db --by calls         # top queries por frecuencia
 *   pnpm cli analyze:db --reset            # resetea pg_stat_statements
 *   pnpm cli analyze:db --tables-only      # solo reporte 2
 */

import { prisma } from '@pila/db';

type SortKey = 'total' | 'mean' | 'calls';

type StatStmtRow = {
  query: string;
  calls: bigint;
  total_exec_time: number;
  mean_exec_time: number;
  rows: bigint;
};

type TableStatRow = {
  relname: string;
  seq_scan: bigint;
  seq_tup_read: bigint;
  idx_scan: bigint | null;
  idx_tup_fetch: bigint | null;
  n_live_tup: bigint;
  n_dead_tup: bigint;
};

type IndexStatRow = {
  relname: string; // tabla
  indexrelname: string; // índice
  idx_scan: bigint;
  idx_tup_read: bigint;
  idx_tup_fetch: bigint;
  index_size: string;
};

function fmtMs(n: number): string {
  if (n < 1) return `${(n * 1000).toFixed(0)}μs`;
  if (n < 1000) return `${n.toFixed(2)}ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(2)}s`;
  return `${(n / 60_000).toFixed(2)}min`;
}

function fmtN(n: bigint | number | null): string {
  if (n == null) return '0';
  const num = typeof n === 'bigint' ? Number(n) : n;
  if (num < 1000) return String(num);
  if (num < 1_000_000) return `${(num / 1000).toFixed(1)}k`;
  return `${(num / 1_000_000).toFixed(1)}M`;
}

function recortarQuery(q: string, max = 110): string {
  const colapsado = q.replace(/\s+/g, ' ').trim();
  if (colapsado.length <= max) return colapsado;
  return `${colapsado.slice(0, max)}…`;
}

async function reporteQueries(sortKey: SortKey, limit: number): Promise<boolean> {
  const ext = await prisma.$queryRaw<Array<{ installed: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
    ) AS installed
  `;
  if (!ext[0]?.installed) {
    console.log(`\n⚠  pg_stat_statements NO está instalado.`);
    console.log(`   Para habilitar: CREATE EXTENSION pg_stat_statements; (requiere superuser)`);
    console.log(`   En Neon: Settings → Extensions del proyecto.`);
    console.log(`   Saltando reporte de queries — sigue el de tablas e índices.\n`);
    return false;
  }

  const orderColumn =
    sortKey === 'total' ? 'total_exec_time' : sortKey === 'mean' ? 'mean_exec_time' : 'calls';

  const query = `
    SELECT query, calls, total_exec_time, mean_exec_time, rows
    FROM pg_stat_statements
    WHERE query !~ '^(BEGIN|COMMIT|ROLLBACK|SET|SHOW|DEALLOCATE|RESET|FETCH)'
      AND query !~ 'pg_(catalog|stat|toast)'
      AND query !~ '_prisma_migrations'
      AND query ~ '^(SELECT|INSERT|UPDATE|DELETE|WITH)'
    ORDER BY ${orderColumn} DESC
    LIMIT ${limit}
  `;
  const rows = await prisma.$queryRawUnsafe<StatStmtRow[]>(query);

  console.log(
    `\n📊 Top ${limit} queries por ${sortKey === 'total' ? 'tiempo total acumulado' : sortKey === 'mean' ? 'promedio individual' : 'cantidad de llamadas'}\n`,
  );
  console.log(`   #  | calls   | total      | mean       | rows    | query`);
  console.log(`  ----+---------+------------+------------+---------+------`);
  rows.forEach((r, i) => {
    const idx = String(i + 1).padStart(3);
    const calls = fmtN(r.calls).padStart(7);
    const total = fmtMs(r.total_exec_time).padStart(10);
    const mean = fmtMs(r.mean_exec_time).padStart(10);
    const filas = fmtN(r.rows).padStart(7);
    console.log(`   ${idx} | ${calls} | ${total} | ${mean} | ${filas} | ${recortarQuery(r.query)}`);
  });
  return true;
}

async function reporteTablas(): Promise<void> {
  const tablas = await prisma.$queryRaw<TableStatRow[]>`
    SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, n_live_tup, n_dead_tup
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY seq_scan DESC
    LIMIT 30
  `;

  console.log(`\n📋 Estadísticas por tabla (top por sequential scans)\n`);
  console.log(
    `   tabla                              | seq_scan | seq_rows | idx_scan | rows live | rows dead`,
  );
  console.log(
    `  ------------------------------------+----------+----------+----------+-----------+----------`,
  );
  tablas.forEach((t) => {
    const name = t.relname.padEnd(35).slice(0, 35);
    const ss = fmtN(t.seq_scan).padStart(8);
    const sr = fmtN(t.seq_tup_read).padStart(8);
    const is = fmtN(t.idx_scan).padStart(8);
    const live = fmtN(t.n_live_tup).padStart(9);
    const dead = fmtN(t.n_dead_tup).padStart(8);
    console.log(`  ${name} | ${ss} | ${sr} | ${is} | ${live} | ${dead}`);
  });
}

async function reporteIndices(): Promise<void> {
  // Índices que NUNCA fueron usados — candidatos a remover (cuestan
  // espacio y bajan velocidad de INSERT/UPDATE).
  const huerfanos = await prisma.$queryRaw<IndexStatRow[]>`
    SELECT
      relname,
      indexrelname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public' AND idx_scan = 0
    ORDER BY pg_relation_size(indexrelid) DESC
    LIMIT 20
  `;

  if (huerfanos.length > 0) {
    console.log(`\n🗑  Índices nunca usados (candidatos a borrar)\n`);
    console.log(`   tabla                 | índice                                  | size`);
    console.log(`  -----------------------+-----------------------------------------+--------`);
    huerfanos.forEach((i) => {
      const tabla = i.relname.padEnd(22).slice(0, 22);
      const idx = i.indexrelname.padEnd(40).slice(0, 40);
      console.log(`  ${tabla} | ${idx} | ${i.index_size}`);
    });
  } else {
    console.log(`\n✅ Todos los índices del schema están en uso.\n`);
  }
}

export async function analyzeDbCommand(options: {
  by?: string;
  limit?: number;
  reset?: boolean;
  tablesOnly?: boolean;
}): Promise<void> {
  if (options.reset) {
    console.log('🔄 Reseteando estadísticas pg_stat_statements...');
    try {
      await prisma.$queryRaw`SELECT pg_stat_statements_reset()`;
      console.log('✅ Estadísticas reseteadas.');
    } catch (err) {
      console.error(`❌ No se pudo resetear: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    await prisma.$disconnect();
    return;
  }

  const sortKey: SortKey =
    options.by === 'mean' ? 'mean' : options.by === 'calls' ? 'calls' : 'total';
  const limit = Number.isFinite(options.limit) && (options.limit ?? 0) > 0 ? options.limit! : 20;

  if (!options.tablesOnly) {
    await reporteQueries(sortKey, limit);
  }
  await reporteTablas();
  await reporteIndices();

  console.log(`\n💡 Cómo leer estos reportes:`);
  console.log(`   - Tablas con muchos seq_scan y pocos idx_scan → posible falta de índice`);
  console.log(`     en alguna columna del WHERE.`);
  console.log(`   - rows dead alto → la tabla necesita VACUUM (Postgres lo hace solo, pero`);
  console.log(`     si lleva mucho tiempo sin pasar puede afectar performance).`);
  console.log(`   - Índices nunca usados → ocupan espacio y enlentecen los INSERT.`);
  console.log(`     Verifica antes de borrar (puede ser un índice de ramp-up reciente).\n`);

  await prisma.$disconnect();
}
