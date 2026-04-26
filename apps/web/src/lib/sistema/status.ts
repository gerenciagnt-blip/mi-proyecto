import { statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { prisma } from '@pila/db';

/**
 * Información de salud del sistema para la status page de ADMIN.
 *
 * Compone tres bloques:
 *   1. **BD**: latencia (ping con SELECT 1) + tamaño total + tamaños
 *      por tabla top 10.
 *   2. **Crons**: último run de cada job conocido + alerta si lleva
 *      más del intervalo esperado sin correr.
 *   3. **Uploads**: cantidad de archivos físicos + tamaño total
 *      ocupado en disco.
 *
 * No es un endpoint público — solo lo consume el server component
 * `/admin/sistema/page.tsx` que hace `requireAdmin()`.
 */

export type ResultadoBD = {
  ok: boolean;
  pingMs: number | null;
  errorMsg: string | null;
  totalSize: string;
  tablas: Array<{ nombre: string; tamano: string; tamanoBytes: number }>;
};

export type CronEsperado = {
  jobName: string;
  /** Cada cuántas horas se espera que corra (max edad aceptable). */
  intervaloHoras: number;
  /** Descripción humana del job. */
  descripcion: string;
};

export type ResultadoCron = {
  jobName: string;
  descripcion: string;
  intervaloHoras: number;
  ultimo: {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    durationMs: number | null;
    output: string | null;
    error: string | null;
  } | null;
  /** Horas desde el último run (Infinity si nunca corrió). */
  horasDesdeUltimo: number;
  /** ¿Está en alerta? (last run hace > 1.5x intervaloHoras). */
  enAlerta: boolean;
};

export type ResultadoUploads = {
  /** Si el directorio no existe (primera vez), null. */
  archivos: number | null;
  tamanoTotalBytes: number | null;
  tamanoTotalLegible: string | null;
  rutaConfigurada: string;
};

export type ResultadoColpatria = {
  /** Cuenta de jobs por status en las últimas 24h (rolling window). */
  ultimas24h: {
    pending: number;
    running: number;
    success: number;
    failed: number;
    retryable: number;
  };
  /** Total acumulado histórico — para dimensionar la tabla. */
  totalHistorico: number;
  /** Empresas con bot activo y con bot configurado (con credenciales). */
  empresas: {
    activas: number;
    configuradas: number;
  };
  /** Job más viejo en estado PENDING (en horas). null si no hay
   *  PENDINGs. Si supera ~1h alerta de que el worker no está corriendo. */
  pendingMasViejoH: number | null;
};

/**
 * Tabla de jobs esperados — agregar acá cada cron que se sume al sistema.
 * Si un job no aparece en esta lista, el status page no lo muestra como
 * "esperado", aunque sus runs sí aparezcan en la consulta a CronRun.
 */
export const CRONS_ESPERADOS: CronEsperado[] = [
  {
    jobName: 'retention-daily',
    intervaloHoras: 24,
    descripcion: 'Retención de documentos (incapacidades + soporte-af, 120d)',
  },
  {
    jobName: 'auditoria-purge-monthly',
    intervaloHoras: 24 * 31, // mensual con margen
    descripcion: 'Purga de bitácora (>12 meses)',
  },
  {
    jobName: 'uploads-cleanup-weekly',
    intervaloHoras: 24 * 7,
    descripcion: 'Limpieza de uploads huérfanos',
  },
];

function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function chequearBD(): Promise<ResultadoBD> {
  const t0 = Date.now();
  let ok = false;
  let pingMs: number | null = null;
  let errorMsg: string | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    pingMs = Date.now() - t0;
    ok = true;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Error desconocido';
  }

  // Tamaño total + por tabla. Si la BD es Postgres, usa pg_database_size
  // y pg_total_relation_size. Si la query falla (BD apagada), devolvemos
  // estructura vacía para no tirar la página entera.
  let totalSize = '?';
  let tablas: ResultadoBD['tablas'] = [];
  if (ok) {
    try {
      const tot = await prisma.$queryRaw<Array<{ size: string }>>`
        SELECT pg_size_pretty(pg_database_size(current_database())) AS size
      `;
      totalSize = tot[0]?.size ?? '?';

      const filas = await prisma.$queryRaw<
        Array<{ relname: string; size_bytes: bigint; size_pretty: string }>
      >`
        SELECT relname,
               pg_total_relation_size(C.oid) AS size_bytes,
               pg_size_pretty(pg_total_relation_size(C.oid)) AS size_pretty
        FROM pg_class C
        LEFT JOIN pg_namespace N ON (N.oid = C.relnamespace)
        WHERE nspname = 'public' AND C.relkind = 'r'
        ORDER BY pg_total_relation_size(C.oid) DESC
        LIMIT 10
      `;
      tablas = filas.map((r) => ({
        nombre: r.relname,
        tamano: r.size_pretty,
        tamanoBytes: Number(r.size_bytes),
      }));
    } catch {
      // El detalle no es crítico — dejamos el ping y total como están.
    }
  }

  return { ok, pingMs, errorMsg, totalSize, tablas };
}

export async function chequearCrons(): Promise<ResultadoCron[]> {
  const ahora = Date.now();

  // Una sola query: el último run de cada jobName conocido. Usamos
  // `distinct` con orderBy DESC para que Prisma agarre el más reciente.
  const jobNames = CRONS_ESPERADOS.map((c) => c.jobName);
  const runs = await prisma.cronRun.findMany({
    where: { jobName: { in: jobNames } },
    orderBy: { startedAt: 'desc' },
    distinct: ['jobName'],
    select: {
      jobName: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      output: true,
      error: true,
    },
  });

  const porJob = new Map(runs.map((r) => [r.jobName, r]));

  return CRONS_ESPERADOS.map((c) => {
    const ultimo = porJob.get(c.jobName) ?? null;
    const horasDesdeUltimo = ultimo
      ? (ahora - ultimo.startedAt.getTime()) / (60 * 60 * 1000)
      : Infinity;
    const enAlerta = horasDesdeUltimo > c.intervaloHoras * 1.5;

    return {
      jobName: c.jobName,
      descripcion: c.descripcion,
      intervaloHoras: c.intervaloHoras,
      ultimo,
      horasDesdeUltimo,
      enAlerta,
    };
  });
}

export async function chequearColpatria(): Promise<ResultadoColpatria> {
  const ahora = Date.now();
  const hace24h = new Date(ahora - 24 * 60 * 60 * 1000);

  // Una sola query con groupBy para los 5 status en 24h.
  // Otra query separada para el total histórico y el más viejo PENDING.
  const [grupos, totalHistorico, masViejoPending, empresasActivas, empresasConfiguradas] =
    await Promise.all([
      prisma.colpatriaAfiliacionJob.groupBy({
        by: ['status'],
        where: { createdAt: { gte: hace24h } },
        _count: { _all: true },
      }),
      prisma.colpatriaAfiliacionJob.count(),
      prisma.colpatriaAfiliacionJob.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.empresa.count({ where: { colpatriaActivo: true, active: true } }),
      prisma.empresa.count({
        where: {
          colpatriaUsuario: { not: null },
          colpatriaPasswordEnc: { not: null },
          active: true,
        },
      }),
    ]);

  const conteo = {
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    retryable: 0,
  };
  for (const g of grupos) {
    const k = g.status.toLowerCase() as keyof typeof conteo;
    if (k in conteo) conteo[k] = g._count._all;
  }

  const pendingMasViejoH = masViejoPending
    ? (ahora - masViejoPending.createdAt.getTime()) / (60 * 60 * 1000)
    : null;

  return {
    ultimas24h: conteo,
    totalHistorico,
    empresas: {
      activas: empresasActivas,
      configuradas: empresasConfiguradas,
    },
    pendingMasViejoH,
  };
}

export function chequearUploads(): ResultadoUploads {
  const ruta = resolve(process.env.UPLOADS_DIR ?? './uploads');

  // Walk síncrono — al ser server-side y ejecutarse al cargar la página,
  // queremos minimizar promesas en cascada. El directorio típico tiene
  // pocos miles de archivos, no es problema en tiempo.
  function walkSync(dir: string): { archivos: number; bytes: number } {
    let archivos = 0;
    let bytes = 0;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { archivos: 0, bytes: 0 };
      }
      throw err;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = walkSync(abs);
        archivos += sub.archivos;
        bytes += sub.bytes;
      } else if (entry.isFile()) {
        archivos += 1;
        try {
          bytes += statSync(abs).size;
        } catch {
          // ignore
        }
      }
    }
    return { archivos, bytes };
  }

  try {
    const r = walkSync(ruta);
    if (r.archivos === 0) {
      // Directorio vacío o no existe.
      return {
        archivos: null,
        tamanoTotalBytes: null,
        tamanoTotalLegible: null,
        rutaConfigurada: ruta,
      };
    }
    return {
      archivos: r.archivos,
      tamanoTotalBytes: r.bytes,
      tamanoTotalLegible: formatearBytes(r.bytes),
      rutaConfigurada: ruta,
    };
  } catch {
    return {
      archivos: null,
      tamanoTotalBytes: null,
      tamanoTotalLegible: null,
      rutaConfigurada: ruta,
    };
  }
}
