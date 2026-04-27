import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireRole } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/colpatria/procesar-ahora — dispara el bot Colpatria para
 * procesar jobs PENDING fuera del cron de GitHub Actions.
 *
 * Sprint 8.5b — Botón "Procesar pendientes ahora" en la UI de jobs.
 *
 * **Estrategia dual** (decidida con operador, "opciones A+B"):
 *
 * - **Local / dev** (NODE_ENV !== 'production'): hace spawn de
 *   `pnpm bot-colpatria procesar --limite 20` detached. El proceso
 *   corre en el server local del operador con browser visible (si
 *   COLPATRIA_HEADLESS=false). Útil para validar manualmente.
 *
 * - **Producción** (NODE_ENV === 'production' + GITHUB_TOKEN
 *   configurado): hace POST a la API de GitHub para disparar el
 *   workflow `bot-colpatria-procesar.yml` con `workflow_dispatch`.
 *   El workflow corre en GH Actions con su propio runner Chromium.
 *   Requiere PAT con scope `workflow`.
 *
 * - **Producción sin GITHUB_TOKEN**: retorna 503 con mensaje claro
 *   pidiendo al ADMIN que configure el secret. NO falla silencioso.
 *
 * Solo STAFF (ADMIN/SOPORTE). El aliado no dispara workers.
 *
 * Idempotencia: el comando `procesar` toma jobs PENDING con
 * `FOR UPDATE SKIP LOCKED`, así que dispararlo varias veces no causa
 * doble procesamiento.
 */
export async function POST() {
  await requireRole('ADMIN', 'SOPORTE');

  // Conteo previo para feedback inmediato
  const pendingAntes = await prisma.colpatriaAfiliacionJob.count({
    where: { status: 'PENDING' },
  });

  if (pendingAntes === 0) {
    return NextResponse.json(
      {
        kind: 'NADA_QUE_PROCESAR',
        message: 'No hay jobs PENDING. El cron los toma automáticamente cuando aparezcan.',
        pending: 0,
      },
      { status: 200 },
    );
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // ============ Producción: dispara GitHub Actions ============
  if (isProduction) {
    const ghToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    const ghRepo = process.env.GITHUB_REPOSITORY ?? 'gerenciagnt-blip/mi-proyecto';

    if (!ghToken) {
      return NextResponse.json(
        {
          kind: 'CONFIG_FALTANTE',
          message:
            'GITHUB_TOKEN no configurado en el server. El ADMIN debe agregarlo a las variables de entorno con scope `workflow`.',
        },
        { status: 503 },
      );
    }

    // GitHub workflow_dispatch — ref es la rama (master por default).
    const ghRef = process.env.GITHUB_REF_NAME ?? 'master';
    try {
      const res = await fetch(
        `https://api.github.com/repos/${ghRepo}/actions/workflows/bot-colpatria-procesar.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${ghToken}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: ghRef,
            inputs: { limite: String(Math.min(pendingAntes, 50)) },
          }),
        },
      );
      if (res.status !== 204) {
        const txt = await res.text().catch(() => '');
        return NextResponse.json(
          {
            kind: 'GH_API_ERROR',
            message: `GitHub API rechazó el dispatch (${res.status}): ${txt.slice(0, 200)}`,
          },
          { status: 502 },
        );
      }
      return NextResponse.json(
        {
          kind: 'GH_DISPATCHED',
          message: `Workflow disparado en GitHub Actions. Procesando ${pendingAntes} job(s) PENDING. La página se actualiza automáticamente al refrescar.`,
          pending: pendingAntes,
        },
        { status: 202 },
      );
    } catch (err) {
      return NextResponse.json(
        {
          kind: 'NETWORK_ERROR',
          message: `No se pudo contactar GitHub API: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 502 },
      );
    }
  }

  // ============ Dev local: spawn proceso detached ============
  // Subimos al raíz del repo (donde está el script `bot-colpatria` del
  // root package.json) y corremos pnpm. `detached: true` + `unref()`
  // hace que el proceso corra independiente del lifecycle del request,
  // así Next puede responder inmediato.
  try {
    const repoRoot = resolve(process.cwd(), '..', '..'); // apps/web → raíz
    // En Windows, `pnpm` necesita `shell: true` porque es un .cmd.
    const child = spawn(
      'pnpm',
      ['bot-colpatria', 'procesar', '--limite', String(Math.min(pendingAntes, 20))],
      {
        cwd: repoRoot,
        detached: true,
        stdio: 'ignore',
        shell: true,
        env: process.env,
      },
    );
    child.unref();
    return NextResponse.json(
      {
        kind: 'LOCAL_SPAWNED',
        message: `Bot disparado localmente (PID ~${child.pid}). Procesando ${pendingAntes} job(s). Refresca la página en ~1 min para ver el resultado.`,
        pending: pendingAntes,
      },
      { status: 202 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        kind: 'SPAWN_ERROR',
        message: `No se pudo spawn del bot: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
