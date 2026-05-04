/**
 * Helper para disparar comandos del bot Colpatria desde la web.
 *
 * Estrategia dual (mismo patrón que `/api/colpatria/procesar-ahora`):
 *
 * - **Dev / local** (NODE_ENV !== 'production'): hace `spawn` del comando
 *   `pnpm bot-colpatria <comando>` detached. Útil para validar manualmente
 *   con browser visible.
 *
 * - **Producción** (NODE_ENV === 'production' + GITHUB_TOKEN): hace POST
 *   a la API de GitHub para disparar el `workflow_dispatch` del workflow
 *   correspondiente. Requiere PAT con scope `workflow`.
 *
 * - **Prod sin GITHUB_TOKEN**: retorna `CONFIG_FALTANTE` con mensaje claro.
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export type DispatchKind =
  | 'NADA_QUE_HACER'
  | 'LOCAL_SPAWNED'
  | 'GH_DISPATCHED'
  | 'CONFIG_FALTANTE'
  | 'GH_API_ERROR'
  | 'NETWORK_ERROR'
  | 'SPAWN_ERROR';

export type DispatchResult = {
  kind: DispatchKind;
  message: string;
  status: number;
};

export type DispatchParams = {
  /** Slug del comando del bot — ej: `'login-auto'`, `'logout-auto'`. */
  comando: string;
  /** Nombre del archivo de workflow en `.github/workflows/`. */
  workflowFile: string;
  /** Args extra para el spawn local (sin incluir el comando). */
  spawnArgs?: string[];
  /** Inputs que se mandan al workflow_dispatch (matching `inputs:` del YAML). */
  workflowInputs?: Record<string, string>;
};

export async function dispararBotColpatria(params: DispatchParams): Promise<DispatchResult> {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const ghToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    const ghRepo = process.env.GITHUB_REPOSITORY ?? 'gerenciagnt-blip/mi-proyecto';

    if (!ghToken) {
      return {
        kind: 'CONFIG_FALTANTE',
        message:
          'GITHUB_TOKEN no configurado en el server. El ADMIN debe agregarlo a las variables de entorno con scope `workflow`.',
        status: 503,
      };
    }

    const ghRef = process.env.GITHUB_REF_NAME ?? 'master';
    try {
      const res = await fetch(
        `https://api.github.com/repos/${ghRepo}/actions/workflows/${params.workflowFile}/dispatches`,
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
            inputs: params.workflowInputs ?? {},
          }),
        },
      );
      if (res.status !== 204) {
        const txt = await res.text().catch(() => '');
        return {
          kind: 'GH_API_ERROR',
          message: `GitHub API rechazó el dispatch (${res.status}): ${txt.slice(0, 200)}`,
          status: 502,
        };
      }
      return {
        kind: 'GH_DISPATCHED',
        message: `Workflow ${params.workflowFile} disparado en GitHub Actions. Refresca en ~1-2 min para ver resultado.`,
        status: 202,
      };
    } catch (err) {
      return {
        kind: 'NETWORK_ERROR',
        message: `No se pudo contactar GitHub API: ${err instanceof Error ? err.message : String(err)}`,
        status: 502,
      };
    }
  }

  // Dev local: spawn detached
  try {
    const repoRoot = resolve(process.cwd(), '..', '..');
    const child = spawn('pnpm', ['bot-colpatria', params.comando, ...(params.spawnArgs ?? [])], {
      cwd: repoRoot,
      detached: true,
      stdio: 'ignore',
      shell: true,
      env: process.env,
    });
    child.unref();
    return {
      kind: 'LOCAL_SPAWNED',
      message: `Bot disparado localmente (PID ~${child.pid}). Refresca la página en ~1 min para ver el resultado.`,
      status: 202,
    };
  } catch (err) {
    return {
      kind: 'SPAWN_ERROR',
      message: `No se pudo spawn del bot: ${err instanceof Error ? err.message : String(err)}`,
      status: 500,
    };
  }
}
