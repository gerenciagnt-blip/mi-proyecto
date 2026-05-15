import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { getSessionTokens, invalidatePagosimpleCache } from '@/lib/pagosimple/auth';
import { consultarBduaRuaf } from '@/lib/pagosimple/bdua-ruaf';
import { getPagosimpleConfig } from '@/lib/pagosimple/config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/health/pagosimple
 *
 * Diagnóstico operacional del operador PagoSimple. Verifica:
 *
 *   1. Env vars presentes (sin exponer valores)
 *   2. Login (POST /auth/login) — mide latencia
 *   3. BDUA/RUAF (POST /bdua-ruaf/data) — mide latencia
 *   4. Estado en BD: contribuyentes sincronizados, planillas validadas
 *
 * Diseño:
 *   - Staff only (requireStaff). No exponemos esto público para evitar
 *     que un atacante use el endpoint como side-channel del login.
 *   - Tolerante a fallos: cada check falla independiente, el endpoint
 *     SIEMPRE responde 200 (la salud específica vive en el body).
 *   - `?nocache=1` invalida el cache de tokens antes de probar — útil
 *     para ver latencia de cold-start. Default usa el cache vivo.
 *
 * Útil para:
 *   - Health checks de Uptime Robot / DataDog (parsear `overall.ok`).
 *   - Debug rápido cuando algo deja de funcionar.
 *   - Verificar la migración del TTL del cache (mira `tokenTtlMin`).
 */
export async function GET(req: Request) {
  await requireStaff();

  const url = new URL(req.url);
  const noCache = url.searchParams.get('nocache') === '1';
  if (noCache) invalidatePagosimpleCache();

  type Check = {
    nombre: string;
    ok: boolean;
    latencyMs?: number;
    detalle?: unknown;
    error?: string;
  };
  const checks: Check[] = [];

  // 1. Env vars
  let envOk = true;
  let envDetalle: Record<string, boolean | string> = {};
  try {
    const cfg = getPagosimpleConfig();
    if (!cfg) {
      envOk = false;
      envDetalle = { configured: false };
    } else {
      const presencias: Record<string, boolean> = {
        baseUrl: !!cfg.baseUrl,
        masterNit: !!cfg.masterNit,
        masterCompany: !!cfg.masterCompany,
        masterSecretKey: !!cfg.masterSecretKey,
        masterDocumentType: !!cfg.masterDocumentType,
        masterDocument: !!cfg.masterDocument,
        masterPassword: !!cfg.masterPassword,
      };
      envDetalle = presencias;
      envOk = Object.values(presencias).every(Boolean);
    }
  } catch (e) {
    envOk = false;
    envDetalle = { error: e instanceof Error ? e.message : String(e) };
  }
  checks.push({ nombre: 'env_vars', ok: envOk, detalle: envDetalle });

  // 2. Login (sólo si env OK)
  if (envOk) {
    const t0 = Date.now();
    try {
      const { token, session_token } = await getSessionTokens();
      checks.push({
        nombre: 'login',
        ok: true,
        latencyMs: Date.now() - t0,
        detalle: {
          tokenLen: token.length,
          sessionTokenLen: session_token.length,
          cacheado: !noCache, // si no forzamos refresh, probable cache hit
        },
      });
    } catch (e) {
      checks.push({
        nombre: 'login',
        ok: false,
        latencyMs: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // 3. BDUA (probe minimalista — endpoint público que requiere solo
    //    base headers). Si el login falló no llegamos acá.
    if (checks[checks.length - 1]!.ok) {
      const t1 = Date.now();
      try {
        const items = await consultarBduaRuaf('CC', '79123456');
        checks.push({
          nombre: 'bdua_ruaf',
          ok: true,
          latencyMs: Date.now() - t1,
          detalle: { items: items.length },
        });
      } catch (e) {
        checks.push({
          nombre: 'bdua_ruaf',
          ok: false,
          latencyMs: Date.now() - t1,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // 4. Estado en BD
  type DbStats = {
    empresasTotal: number;
    empresasSync: number;
    empresasUltSyncAt: string | null;
    cotizantesIndepTotal: number;
    cotizantesIndepSync: number;
    cotizantesUltSyncAt: string | null;
    planillasTotal: number;
    planillasValidadas: number;
    planillasConUrlPago: number;
    planillasOk: number;
    planillasError: number;
    planillasUltSyncAt: string | null;
  };
  let dbStats: DbStats | null = null;
  let dbError: string | undefined;
  try {
    const [
      empresasTotal,
      empresasSync,
      empresasUlt,
      cotizantesIndepTotal,
      cotizantesIndepSync,
      cotizantesUlt,
      planillasTotal,
      planillasValidadas,
      planillasConUrl,
      planillasUlt,
      planillasPorEstado,
    ] = await Promise.all([
      prisma.empresa.count({ where: { active: true } }),
      prisma.empresa.count({
        where: { active: true, pagosimpleContributorId: { not: null } },
      }),
      prisma.empresa.findFirst({
        where: { pagosimpleSyncedAt: { not: null } },
        orderBy: { pagosimpleSyncedAt: 'desc' },
        select: { pagosimpleSyncedAt: true },
      }),
      prisma.cotizante.count({
        where: { afiliaciones: { some: { modalidad: 'INDEPENDIENTE' } } },
      }),
      prisma.cotizante.count({
        where: {
          pagosimpleContributorId: { not: null },
          afiliaciones: { some: { modalidad: 'INDEPENDIENTE' } },
        },
      }),
      prisma.cotizante.findFirst({
        where: { pagosimpleSyncedAt: { not: null } },
        orderBy: { pagosimpleSyncedAt: 'desc' },
        select: { pagosimpleSyncedAt: true },
      }),
      prisma.planilla.count(),
      prisma.planilla.count({ where: { pagosimpleNumero: { not: null } } }),
      prisma.planilla.count({ where: { pagosimplePaymentUrl: { not: null } } }),
      prisma.planilla.findFirst({
        where: { pagosimpleSyncedAt: { not: null } },
        orderBy: { pagosimpleSyncedAt: 'desc' },
        select: { pagosimpleSyncedAt: true },
      }),
      prisma.planilla.groupBy({
        by: ['pagosimpleEstadoValidacion'],
        _count: { _all: true },
        where: { pagosimpleEstadoValidacion: { not: null } },
      }),
    ]);
    const okCount =
      planillasPorEstado.find((g) => g.pagosimpleEstadoValidacion === 'OK')?._count._all ?? 0;
    const errorCount =
      planillasPorEstado.find((g) => g.pagosimpleEstadoValidacion === 'ERROR')?._count._all ?? 0;
    dbStats = {
      empresasTotal,
      empresasSync,
      empresasUltSyncAt: empresasUlt?.pagosimpleSyncedAt?.toISOString() ?? null,
      cotizantesIndepTotal,
      cotizantesIndepSync,
      cotizantesUltSyncAt: cotizantesUlt?.pagosimpleSyncedAt?.toISOString() ?? null,
      planillasTotal,
      planillasValidadas,
      planillasConUrlPago: planillasConUrl,
      planillasOk: okCount,
      planillasError: errorCount,
      planillasUltSyncAt: planillasUlt?.pagosimpleSyncedAt?.toISOString() ?? null,
    };
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }
  checks.push({
    nombre: 'db_state',
    ok: !dbError,
    detalle: dbStats ?? undefined,
    error: dbError,
  });

  const overallOk = checks.every((c) => c.ok);
  const cfg = envOk ? getPagosimpleConfig() : null;

  return NextResponse.json(
    {
      overall: { ok: overallOk, timestamp: new Date().toISOString() },
      config: cfg
        ? {
            baseUrlHost: new URL(cfg.baseUrl).host,
            masterNit: cfg.masterNit,
            tokenTtlMin: cfg.tokenTtlMin,
          }
        : null,
      checks,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
