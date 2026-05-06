import { prisma } from '@pila/db';
import { decrypt } from '../lib/crypto.js';
import { abrirBrowser, nuevoContext, cerrarTodo } from '../lib/browser.js';
import { cargarSesion, guardarSesion, invalidarSesion } from '../lib/session.js';
import { loginCompleto, sesionValida } from '../pages/login.js';
import { descargarCertificadoVigente } from '../pages/certificado-vigente.js';
import { mapearTipoDocumento } from '../lib/payload-form.js';
import { guardarPdfCertificado, validarUploadsDirOAlertar } from '../lib/storage.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('descargar-certificados');

/**
 * Sprint 8.6 — Procesa jobs `ColpatriaCertificadoJob` en estado PENDING.
 *
 * Flujo (idéntica estructura a `procesar` pero sin lógica de form):
 *   1. Toma N jobs PENDING (FOR UPDATE SKIP LOCKED) y los marca RUNNING.
 *   2. Agrupa por empresaId (1 sesión cacheada por empresa).
 *   3. Login con reuso de sesión.
 *   4. Por cada job: navega a Consulta, busca por documento del
 *      cotizante, click en "Imprimir Certificado", captura PDF.
 *   5. Guarda el PDF en `colpatria/<empresaId>/certificados/`.
 *   6. Marca SUCCESS con `pdfPath`. El endpoint de servicio borra el
 *      archivo después de entregarlo.
 */
export async function descargarCertificadosCommand(options: {
  limite: number;
  empresaId?: string;
}): Promise<number> {
  const inicio = Date.now();
  log.info({ limite: options.limite, empresaId: options.empresaId }, 'iniciando');

  try {
    await validarUploadsDirOAlertar();
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : err },
      'validación UPLOADS_DIR falló inesperadamente',
    );
  }

  const jobs = await prisma.$transaction(async (tx) => {
    const ids = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM colpatria_certificado_jobs
       WHERE status = 'PENDING' ${options.empresaId ? `AND "empresaId" = $1` : ''}
       ORDER BY "createdAt" ASC
       LIMIT ${options.limite}
       FOR UPDATE SKIP LOCKED`,
      ...(options.empresaId ? [options.empresaId] : []),
    );
    if (ids.length === 0) return [];
    await tx.colpatriaCertificadoJob.updateMany({
      where: { id: { in: ids.map((r) => r.id) } },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    return tx.colpatriaCertificadoJob.findMany({
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
        afiliacion: {
          select: {
            cotizante: {
              select: { tipoDocumento: true, numeroDocumento: true },
            },
          },
        },
      },
    });
  });

  console.log(`\n🤖 Certificados Colpatria — ${jobs.length} job(s) PENDING\n`);
  if (jobs.length === 0) {
    console.log('✅ Nada que procesar.');
    await prisma.$disconnect();
    return 0;
  }

  const porEmpresa = new Map<string, typeof jobs>();
  for (const j of jobs) {
    const arr = porEmpresa.get(j.empresaId) ?? [];
    arr.push(j);
    porEmpresa.set(j.empresaId, arr);
  }

  let exitOk = 0;
  let exitFail = 0;

  for (const [empresaId, jobsEmpresa] of porEmpresa) {
    const empresa = jobsEmpresa[0]!.empresa;
    console.log(`\n📦 Empresa ${empresa.nit} — ${empresa.nombre} (${jobsEmpresa.length} jobs)`);

    if (
      !empresa.colpatriaUsuario ||
      !empresa.colpatriaPasswordEnc ||
      !empresa.colpatriaAplicacion ||
      !empresa.colpatriaPerfil ||
      !empresa.colpatriaEmpresaIdInterno ||
      !empresa.colpatriaAfiliacionId
    ) {
      const msg = 'Empresa sin credenciales/selectores Colpatria completos';
      log.error({ empresaId }, msg);
      for (const j of jobsEmpresa) await marcarFallo(j.id, msg, true, 0);
      exitFail += jobsEmpresa.length;
      continue;
    }

    let password: string;
    try {
      password = decrypt(empresa.colpatriaPasswordEnc);
    } catch (err) {
      const msg = `Falló descifrar password: ${err instanceof Error ? err.message : err}`;
      log.error({ empresaId }, msg);
      for (const j of jobsEmpresa) await marcarFallo(j.id, msg, false, 0);
      exitFail += jobsEmpresa.length;
      continue;
    }

    const browser = await abrirBrowser();
    const sesionCacheada = await cargarSesion(empresaId);
    const context = await nuevoContext(browser, sesionCacheada ?? undefined);
    const page = await context.newPage();

    try {
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

      for (const job of jobsEmpresa) {
        const t0 = Date.now();
        log.info({ jobId: job.id }, 'procesando certificado');
        try {
          const tipoPila = job.afiliacion.cotizante.tipoDocumento;
          const numeroDoc = job.afiliacion.cotizante.numeroDocumento;
          let tipoAxa: string;
          try {
            tipoAxa = mapearTipoDocumento(tipoPila);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await marcarFallo(job.id, msg, false, Date.now() - t0);
            exitFail++;
            console.log(`   · job ${job.id.slice(-8)}: FAILED — ${msg}`);
            continue;
          }

          const r = await descargarCertificadoVigente(page, {
            tipoIdentificacion: tipoAxa,
            documento: numeroDoc,
          });

          if (r.kind === 'ERROR' && r.mensaje?.includes('Sesión expir')) {
            throw new Error('SESION_EXPIRADA');
          }

          if (r.kind === 'NO_EXISTE') {
            await marcarFallo(
              job.id,
              `Empleado no existe en AXA — ${tipoPila} ${numeroDoc}. Verificar afiliación.`,
              false,
              Date.now() - t0,
            );
            exitFail++;
            console.log(`   · job ${job.id.slice(-8)}: FAILED — no existe en AXA`);
            continue;
          }

          if (r.kind === 'ERROR') {
            await marcarFallo(job.id, r.mensaje, true, Date.now() - t0);
            exitFail++;
            console.log(`   · job ${job.id.slice(-8)}: RETRY — ${r.mensaje}`);
            continue;
          }

          // OK — guardar PDF + marcar SUCCESS
          const saved = await guardarPdfCertificado(r.pdf, empresaId, job.id);
          await marcarOk(job.id, saved.path, Date.now() - t0);
          exitOk++;
          console.log(
            `   · job ${job.id.slice(-8)}: ✅ certificado descargado (${saved.size} bytes)`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === 'SESION_EXPIRADA') {
            log.warn({ jobId: job.id, empresaId }, 'sesión expirada — re-encolando');
            await prisma.colpatriaCertificadoJob.update({
              where: { id: job.id },
              data: {
                status: 'PENDING',
                startedAt: null,
                error: 'Sesión expiró durante Consulta',
              },
            });
            await invalidarSesion(empresaId);
            break;
          }
          await marcarFallo(job.id, msg, true, Date.now() - t0);
          exitFail++;
          console.log(`   · job ${job.id.slice(-8)}: FALLÓ — ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ empresaId, err: msg }, 'falló login de empresa');
      for (const j of jobsEmpresa) {
        await marcarFallo(j.id, `Login empresa falló: ${msg}`, true, 0);
      }
      exitFail += jobsEmpresa.length;
    } finally {
      await cerrarTodo(browser, context);
    }
  }

  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`\n📊 Resumen: ${exitOk} OK · ${exitFail} fallidos · ${dur}s\n`);
  await prisma.$disconnect();
  return exitFail > 0 ? 1 : 0;
}

async function marcarOk(jobId: string, pdfPath: string, durationMs: number): Promise<void> {
  log.info({ jobId, pdfPath }, 'certificado descargado OK');
  await prisma.colpatriaCertificadoJob.update({
    where: { id: jobId },
    data: {
      status: 'SUCCESS',
      finishedAt: new Date(),
      durationMs,
      error: null,
      pdfPath,
    },
  });
}

async function marcarFallo(
  jobId: string,
  mensaje: string,
  retryable: boolean,
  durationMs: number,
): Promise<void> {
  await prisma.colpatriaCertificadoJob.update({
    where: { id: jobId },
    data: {
      status: retryable ? 'RETRYABLE' : 'FAILED',
      finishedAt: new Date(),
      durationMs,
      error: mensaje,
    },
  });
}
