import { prisma } from '@pila/db';
import { decrypt } from '../lib/crypto.js';
import { abrirBrowser, nuevoContext, cerrarTodo } from '../lib/browser.js';
import { cargarSesion, guardarSesion, invalidarSesion } from '../lib/session.js';
import { loginCompleto, sesionValida } from '../pages/login.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('procesar');

/**
 * Procesa jobs ColpatriaAfiliacionJob en estado PENDING.
 *
 * **Sprint 8.3** — solo implementa el shell:
 *   1. Lee N jobs PENDING (FOR UPDATE SKIP LOCKED para evitar carrera
 *      con otro worker que esté corriendo en paralelo)
 *   2. Los agrupa por empresaId (1 sesión por empresa)
 *   3. Para cada empresa, hace login (o reusa cache)
 *   4. Por cada job: marca RUNNING, navega a IngresoIndividual,
 *      **deja el job en RETRYABLE con output "form fill no implementado"**
 *
 * El llenado real del formulario y submit lo implementa Sprint 8.4.
 * El PDF y storage lo hace Sprint 8.5. Por ahora este worker solo
 * valida que la sesión funciona y la nav al form llega.
 */

const PLACEHOLDER_OUTPUT =
  'Sprint 8.3: login OK + nav a IngresoIndividual OK · llenado pendiente (Sprint 8.4)';

export async function procesarCommand(options: {
  limite: number;
  empresaId?: string;
}): Promise<number> {
  const inicio = Date.now();
  log.info({ limite: options.limite, empresaId: options.empresaId }, 'iniciando procesar');

  // 1. Tomar jobs PENDING. Usamos `transaction` con FOR UPDATE SKIP
  //    LOCKED para evitar que dos workers tomen los mismos jobs si hay
  //    overlap entre runs del cron.
  const jobs = await prisma.$transaction(async (tx) => {
    const ids = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM colpatria_afiliacion_jobs
       WHERE status = 'PENDING' ${options.empresaId ? `AND "empresaId" = $1` : ''}
       ORDER BY "createdAt" ASC
       LIMIT ${options.limite}
       FOR UPDATE SKIP LOCKED`,
      ...(options.empresaId ? [options.empresaId] : []),
    );
    if (ids.length === 0) return [];

    // Marcamos como RUNNING dentro de la misma transacción (los locks
    // se liberan al commit y nadie más los va a tomar).
    await tx.colpatriaAfiliacionJob.updateMany({
      where: { id: { in: ids.map((r) => r.id) } },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    return tx.colpatriaAfiliacionJob.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: {
        empresa: {
          select: {
            id: true,
            nit: true,
            nombre: true,
            colpatriaUsuario: true,
            colpatriaPasswordEnc: true,
            colpatriaAplicacion: true,
            colpatriaPerfil: true,
            colpatriaEmpresaIdInterno: true,
            colpatriaAfiliacionId: true,
          },
        },
      },
    });
  });

  console.log(`\n🤖 Bot Colpatria — ${jobs.length} job(s) PENDING tomados\n`);
  if (jobs.length === 0) {
    console.log('✅ Nada que procesar.');
    await prisma.$disconnect();
    return 0;
  }

  // 2. Agrupar por empresa
  const porEmpresa = new Map<string, typeof jobs>();
  for (const j of jobs) {
    const arr = porEmpresa.get(j.empresaId) ?? [];
    arr.push(j);
    porEmpresa.set(j.empresaId, arr);
  }

  let exitOk = 0;
  let exitFail = 0;

  // 3. Por empresa, login una vez y procesar sus jobs
  for (const [empresaId, jobsEmpresa] of porEmpresa) {
    const empresa = jobsEmpresa[0]!.empresa;
    console.log(`\n📦 Empresa ${empresa.nit} — ${empresa.nombre} (${jobsEmpresa.length} jobs)`);

    // Validar config completa antes de abrir browser
    if (
      !empresa.colpatriaUsuario ||
      !empresa.colpatriaPasswordEnc ||
      !empresa.colpatriaAplicacion ||
      !empresa.colpatriaPerfil ||
      !empresa.colpatriaEmpresaIdInterno ||
      !empresa.colpatriaAfiliacionId
    ) {
      const msg = 'Empresa sin config Colpatria completa';
      log.error({ empresaId }, msg);
      for (const j of jobsEmpresa) {
        await marcarFallo(j.id, msg, true /* retryable: el ADMIN puede arreglar */);
      }
      exitFail += jobsEmpresa.length;
      continue;
    }

    let password: string;
    try {
      password = decrypt(empresa.colpatriaPasswordEnc);
    } catch (err) {
      const msg = `Falló descifrar password: ${err instanceof Error ? err.message : err}`;
      log.error({ empresaId }, msg);
      for (const j of jobsEmpresa) await marcarFallo(j.id, msg, false);
      exitFail += jobsEmpresa.length;
      continue;
    }

    const browser = await abrirBrowser();
    const sesionCacheada = await cargarSesion(empresaId);
    const context = await nuevoContext(browser, sesionCacheada ?? undefined);
    const page = await context.newPage();

    try {
      // Probar sesión o login fresco
      let necesitaLogin = !sesionCacheada;
      if (sesionCacheada) {
        const valida = await sesionValida(page);
        if (!valida) {
          await invalidarSesion(empresaId);
          necesitaLogin = true;
        }
      }
      if (necesitaLogin) {
        await loginCompleto(
          page,
          { usuario: empresa.colpatriaUsuario, password },
          {
            aplicacion: empresa.colpatriaAplicacion,
            perfil: empresa.colpatriaPerfil,
            empresaIdInterno: empresa.colpatriaEmpresaIdInterno,
            afiliacionId: empresa.colpatriaAfiliacionId,
          },
        );
        await guardarSesion(empresaId, context);
      }

      // Por cada job de esta empresa: navegar al form (placeholder hasta 8.4)
      for (const job of jobsEmpresa) {
        log.info({ jobId: job.id }, 'procesando');
        try {
          // Sprint 8.4 va a llenar y enviar acá. Por ahora solo
          // confirmamos que la nav funciona.
          const valida = await sesionValida(page);
          if (!valida) {
            throw new Error('Sesión perdió validez en medio del lote');
          }
          await marcarRetryable(job.id, PLACEHOLDER_OUTPUT);
          exitOk++; // OK relativo: la pieza de 8.3 hizo lo suyo
          console.log(`   · job ${job.id.slice(-8)}: nav OK (placeholder)`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await marcarFallo(job.id, msg, true);
          exitFail++;
          console.log(`   · job ${job.id.slice(-8)}: FALLÓ — ${msg}`);
        }
      }
    } catch (err) {
      // Falló el login mismo: todos los jobs de esta empresa pierden
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ empresaId, err: msg }, 'falló login de empresa');
      for (const j of jobsEmpresa) {
        await marcarFallo(j.id, `Login empresa falló: ${msg}`, true);
      }
      exitFail += jobsEmpresa.length;
    } finally {
      await cerrarTodo(browser, context);
    }
  }

  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`\n📊 Resumen: ${exitOk} OK (placeholder) · ${exitFail} fallidos · ${dur}s\n`);
  await prisma.$disconnect();
  return exitFail > 0 ? 1 : 0;
}

async function marcarRetryable(jobId: string, output: string): Promise<void> {
  await prisma.colpatriaAfiliacionJob.update({
    where: { id: jobId },
    data: {
      status: 'RETRYABLE',
      finishedAt: new Date(),
      durationMs: 0,
      error: output,
    },
  });
}

async function marcarFallo(jobId: string, mensaje: string, retryable: boolean): Promise<void> {
  await prisma.colpatriaAfiliacionJob.update({
    where: { id: jobId },
    data: {
      status: retryable ? 'RETRYABLE' : 'FAILED',
      finishedAt: new Date(),
      error: mensaje,
    },
  });
}
