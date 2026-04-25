import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/health — endpoint de salud para monitoreo (Kubernetes liveness,
 * Vercel cron health, Uptime Kuma, etc.).
 *
 * Estados:
 *   - 200 + { status: "ok" }       todo funciona
 *   - 503 + { status: "degraded" } el server responde pero la BD no
 *
 * Pingea Postgres con un `SELECT 1` (más liviano que cualquier query del
 * dominio) y mide la latencia en ms. La latencia se incluye en la
 * respuesta para detectar degradación gradual antes de que falle.
 *
 * No requiere autenticación — un health check público es estándar y la
 * info expuesta no es sensible.
 */
export async function GET() {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  let dbOk = false;
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'Error desconocido';
  }

  const totalMs = Date.now() - startedAt;
  const status = dbOk ? 'ok' : 'degraded';
  const httpStatus = dbOk ? 200 : 503;

  return NextResponse.json(
    {
      status,
      timestamp: startedAtIso,
      uptimeSec: Math.round(process.uptime()),
      service: '@pila/web',
      checks: {
        db: {
          ok: dbOk,
          latencyMs: dbLatencyMs,
          error: dbError,
        },
      },
      totalMs,
    },
    {
      status: httpStatus,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
