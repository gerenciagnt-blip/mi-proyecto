import { prisma } from '@pila/db';
import { decrypt } from '../lib/crypto.js';
import { abrirBrowser, nuevoContext, cerrarTodo } from '../lib/browser.js';
import { cargarSesion, guardarSesion, invalidarSesion } from '../lib/session.js';
import { loginCompleto, sesionValida } from '../pages/login.js';
import { verificarEmpleado, llenarYCrearEmpleado } from '../pages/ingreso-individual.js';
import {
  prepararCamposIngreso,
  validarPayloadParaIngreso,
  type ColpatriaPayload,
  type ConfigResuelta,
} from '../lib/payload-form.js';
import { decidirAccion, reactivarHabilitado } from '../lib/decidir-accion.js';
import { guardarPdfComprobante, validarUploadsDirOAlertar } from '../lib/storage.js';
import { createLogger } from '../lib/logger.js';
import { runWatchdog } from '../lib/watchdog.js';

const log = createLogger('procesar');

/**
 * Procesa jobs ColpatriaAfiliacionJob en estado PENDING.
 *
 * **Sprint 8.4** — implementación completa del flujo de creación:
 *   1. Lee N jobs PENDING (FOR UPDATE SKIP LOCKED para evitar carrera
 *      con otro worker que esté corriendo en paralelo)
 *   2. Los agrupa por empresaId (1 sesión por empresa)
 *   3. Para cada empresa, hace login (o reusa cache)
 *   4. Por cada job:
 *      - Valida payload + arma config
 *      - Verifica empleado (BUSCAR)
 *      - Si NUEVO → llena formIngreso + submit
 *      - Marca SUCCESS / RETRYABLE / FAILED según resultado
 *
 * **Sprint 8.5** agregará la descarga del PDF de comprobante tras el
 * submit exitoso.
 *
 * EPS/AFP siguen como TODO — el payload no las trae con código AXA.
 * Mientras tanto: el portal va a fallar la validación de submit con
 * mensaje claro y el job queda RETRYABLE.
 */

export async function procesarCommand(options: {
  limite: number;
  empresaId?: string;
}): Promise<number> {
  const inicio = Date.now();
  log.info({ limite: options.limite, empresaId: options.empresaId }, 'iniciando procesar');

  // 0a. Validar UPLOADS_DIR — si está mal, los PDFs se pierden silencioso.
  //     No bloqueante (con archivos efímeros el bot igual procesa el flujo
  //     en AXA), pero deja alerta clara en Sentry para el operador.
  try {
    await validarUploadsDirOAlertar();
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : err },
      'validación UPLOADS_DIR falló inesperadamente',
    );
  }

  // 0b. Watchdog preventivo: revivir zombies + reciclar RETRYABLE +
  //    detectar tasa anormal de fallos. Es barato (3 queries) y se
  //    ejecuta antes de tomar jobs nuevos para que los zombies y
  //    RETRYABLE listos vuelvan a la cola PENDING que el SELECT de
  //    abajo va a leer.
  try {
    const wd = await runWatchdog();
    if (wd.zombies > 0 || wd.reciclados > 0 || wd.agotados > 0) {
      console.log(
        `🐕 Watchdog: ${wd.zombies} zombie(s) · ${wd.reciclados} reciclado(s) · ${wd.agotados} agotado(s)`,
      );
    }
  } catch (err) {
    // No bloquear el procesar si el watchdog falla — solo loguear.
    log.error({ err: err instanceof Error ? err.message : err }, 'watchdog falló (no bloqueante)');
  }

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
            colpatriaCodigoSucursalDefault: true,
            colpatriaTipoAfiliacionDefault: true,
            colpatriaGrupoOcupacionDefault: true,
            colpatriaTipoOcupacionDefault: true,
            nivelesPermitidos: {
              select: {
                nivel: true,
                colpatriaCentroTrabajo: true,
                colpatriaGrupoOcupacion: true,
                colpatriaTipoOcupacion: true,
              },
            },
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

  // Feature flag REACTIVAR — leído una sola vez por run.
  const reactivarEnabled = reactivarHabilitado();
  if (!reactivarEnabled) {
    console.log('⚠️  REACTIVAR deshabilitado por flag (COLPATRIA_REACTIVAR_ENABLED=false)');
  }

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
      !empresa.colpatriaAfiliacionId ||
      !empresa.colpatriaCodigoSucursalDefault ||
      !empresa.colpatriaTipoAfiliacionDefault ||
      !empresa.colpatriaGrupoOcupacionDefault ||
      !empresa.colpatriaTipoOcupacionDefault
    ) {
      const msg = 'Empresa sin config Colpatria completa (faltan defaults o credenciales)';
      log.error({ empresaId }, msg);
      for (const j of jobsEmpresa) {
        await marcarFallo(j.id, msg, true /* retryable: el ADMIN puede arreglar */, 0);
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
      for (const j of jobsEmpresa) await marcarFallo(j.id, msg, false, 0);
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

      // Por cada job de esta empresa: BUSCAR + llenar + submit
      for (const job of jobsEmpresa) {
        const t0 = Date.now();
        log.info({ jobId: job.id }, 'procesando');
        try {
          const payload = job.payload as unknown as ColpatriaPayload;

          // Validación temprana — evita abrir form si el payload es inválido
          const erroresPayload = validarPayloadParaIngreso(payload);
          if (erroresPayload.length > 0) {
            // No retryable: data no es procesable, requiere intervención
            // del ADMIN para corregir la afiliación en PILA primero.
            await marcarFallo(
              job.id,
              `Payload inválido: ${erroresPayload.join('; ')}`,
              false,
              Date.now() - t0,
            );
            exitFail++;
            console.log(`   · job ${job.id.slice(-8)}: payload inválido (FAILED)`);
            continue;
          }

          // Resolver config por nivel (Opción B: mapeo nivel→grupo/tipo/centro)
          const config = resolverConfig(empresa, payload.afiliacion.nivelRiesgo);

          const campos = prepararCamposIngreso(payload, config);

          // Verificar si el empleado ya existe (form de Consulta)
          const verif = await verificarEmpleado(page, campos.consulta);

          // Sesión expirada interrumpe el bucle de la empresa para
          // forzar un re-login en el próximo run; el resto de errores
          // los maneja decidirAccion como retryable.
          if (verif.kind === 'ERROR' && verif.mensaje?.includes('Sesión expiró')) {
            throw new Error('SESION_EXPIRADA');
          }

          const decision = decidirAccion(verif, payload.evento, { reactivarEnabled });

          if (decision.kind === 'FALLAR') {
            await marcarFallo(job.id, decision.mensaje, decision.retryable, Date.now() - t0);
            exitFail++;
            const tag = decision.retryable ? 'RETRY' : 'FAILED';
            console.log(`   · job ${job.id.slice(-8)}: ${tag} — ${decision.mensaje}`);
            continue;
          }

          // decision.kind === 'PROCEDER' — llenamos el form completo.
          // AXA usa el mismo flujo para CREAR y REACTIVAR; el form viene
          // pre-cargado cuando ID_OPERACION!=0 y el botón cambia a
          // "Modificar" (el selector ya cubre ambos casos).
          const res = await llenarYCrearEmpleado(page, campos);
          if (decision.warnings) {
            res.warnings.push(...decision.warnings);
          }

          if (res.ok) {
            const warnings = res.warnings.length > 0 ? ` · warnings: ${res.warnings.length}` : '';

            // Sprint 8.5.B: guardar el PDF de comprobante si AXA lo
            // ofreció. No bloqueante — si no hay PDF, marcamos SUCCESS
            // igual con un warning extra. El operador puede re-imprimir
            // manualmente desde el portal si necesita el soporte.
            let pdfPath: string | null = null;
            if (res.pdfBuffer) {
              try {
                const saved = await guardarPdfComprobante(res.pdfBuffer, empresaId, job.id);
                pdfPath = saved.path;
                log.info(
                  { jobId: job.id, pdfPath, size: saved.size },
                  'PDF de comprobante guardado',
                );
              } catch (errStorage) {
                log.warn(
                  {
                    jobId: job.id,
                    err: errStorage instanceof Error ? errStorage.message : errStorage,
                  },
                  'falló guardado de PDF — el job sigue como SUCCESS sin pdfPath',
                );
              }
            }

            const verbo = decision.modo === 'REACTIVAR' ? 'Reactivado' : 'Creado';
            await marcarOk(
              job.id,
              `${verbo} en AXA · URL: ${res.urlFinal}${res.mensaje ? ` · ${res.mensaje}` : ''}${warnings}${pdfPath ? ' · pdf:✓' : ''}`,
              Date.now() - t0,
              pdfPath,
            );
            exitOk++;
            console.log(
              `   · job ${job.id.slice(-8)}: ✅ ${verbo.toLowerCase()}${pdfPath ? ' (con PDF)' : ''}`,
            );
          } else {
            await marcarFallo(
              job.id,
              `Submit no exitoso: ${res.mensaje ?? 'sin mensaje'} · URL=${res.urlFinal}`,
              true,
              Date.now() - t0,
            );
            exitFail++;
            console.log(
              `   · job ${job.id.slice(-8)}: ❌ submit falló — ${res.mensaje ?? 'sin mensaje'}`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === 'SESION_EXPIRADA') {
            // Romper el bucle — el caller del catch externo va a relogear
            // en el siguiente lote. Marcamos PENDING para reintento.
            log.warn({ jobId: job.id, empresaId }, 'sesión expirada — re-encolando');
            await prisma.colpatriaAfiliacionJob.update({
              where: { id: job.id },
              data: { status: 'PENDING', startedAt: null, error: 'Sesión expiró durante BUSCAR' },
            });
            await invalidarSesion(empresaId);
            break; // saltar el resto de jobs de esta empresa, próximo run los toma
          }
          await marcarFallo(job.id, msg, true, Date.now() - t0);
          exitFail++;
          console.log(`   · job ${job.id.slice(-8)}: FALLÓ — ${msg}`);
        }
      }
    } catch (err) {
      // Falló el login mismo: todos los jobs de esta empresa pierden
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

// ============================================================================
// Helpers de marcado de jobs
// ============================================================================

async function marcarOk(
  jobId: string,
  mensajeInfo: string,
  durationMs: number,
  pdfPath: string | null = null,
): Promise<void> {
  // Logueamos el mensaje a stdout/Pino. El modelo no tiene campo
  // dedicado para "output" exitoso — solo `error` (que dejamos null
  // para SUCCESS) y `pdfPath` (Sprint 8.5.B).
  log.info({ jobId, info: mensajeInfo, pdfPath }, 'job exitoso');
  await prisma.colpatriaAfiliacionJob.update({
    where: { id: jobId },
    data: {
      status: 'SUCCESS',
      finishedAt: new Date(),
      durationMs,
      error: null,
      pdfPath,
    },
  });
  // Sprint Soporte reorg — registrar gestión automática en la bitácora
  // de la SoporteAfiliacion correspondiente (si existe). Esto deja
  // trazabilidad uniforme en el modal de detalle: el usuario soporte ve
  // que el bot procesó la ARL y puede descargar el PDF desde la propia
  // tarjeta del bot.
  await registrarGestionBot(jobId, 'SUCCESS', mensajeInfo, pdfPath);
}

async function marcarFallo(
  jobId: string,
  mensaje: string,
  retryable: boolean,
  durationMs: number,
): Promise<void> {
  await prisma.colpatriaAfiliacionJob.update({
    where: { id: jobId },
    data: {
      status: retryable ? 'RETRYABLE' : 'FAILED',
      finishedAt: new Date(),
      durationMs,
      error: mensaje,
    },
  });
  await registrarGestionBot(jobId, retryable ? 'RETRYABLE' : 'FAILED', mensaje, null);
}

/**
 * Sprint Soporte reorg — Espeja el resultado del job a la bitácora de
 * la SoporteAfiliacion (cuando existe una para esa afiliación). El bot
 * NO falla si esto no funciona — la bitácora es informativa, el job ya
 * persistió su propio estado.
 */
async function registrarGestionBot(
  jobId: string,
  status: 'SUCCESS' | 'FAILED' | 'RETRYABLE',
  mensaje: string,
  pdfPath: string | null,
): Promise<void> {
  try {
    const job = await prisma.colpatriaAfiliacionJob.findUnique({
      where: { id: jobId },
      select: { afiliacionId: true, intento: true },
    });
    if (!job) return;

    // Buscamos la SoporteAfiliacion vigente para esa afiliación. Es
    // razonable que haya una (la que disparó la creación del job vía
    // `dispatch`). Si no la hay, no escribimos nada — el job de bot
    // pudo ser creado manualmente sin pasar por una solicitud.
    const sol = await prisma.soporteAfiliacion.findFirst({
      where: { afiliacionId: job.afiliacionId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!sol) return;

    const descripcion =
      status === 'SUCCESS'
        ? `Bot Colpatria · afiliación ARL completada (intento ${job.intento})${
            pdfPath ? ' · PDF de afiliación disponible para descarga.' : ''
          }${mensaje ? `\n${mensaje}` : ''}`
        : status === 'RETRYABLE'
          ? `Bot Colpatria · falló intento ${job.intento} (reintentable). ${mensaje}`
          : `Bot Colpatria · falló intento ${job.intento} (definitivo). ${mensaje}`;

    await prisma.soporteAfGestion.create({
      data: {
        soporteAfId: sol.id,
        accionadaPor: 'BOT',
        nuevoEstado: null,
        descripcion,
        userId: null,
        userName: 'Bot Colpatria',
      },
    });
  } catch (err) {
    log.warn(
      { jobId, err: err instanceof Error ? err.message : err },
      'no se pudo registrar gestión BOT en SoporteAfiliacion',
    );
  }
}

// ============================================================================
// Config resolver — espejo de apps/web/src/lib/colpatria/config-resolver.ts
// ============================================================================
//
// El bot no puede importar de apps/web (cross-app). Si la lógica de
// resolución cambia en web, hay que sincronizar aquí. Los tests del
// resolver viven en apps/web (333 tests, suite ya estable).
//

type EmpresaConColpatria = {
  nit: string;
  colpatriaAplicacion: string | null;
  colpatriaPerfil: string | null;
  colpatriaEmpresaIdInterno: string | null;
  colpatriaAfiliacionId: string | null;
  colpatriaCodigoSucursalDefault: string | null;
  colpatriaTipoAfiliacionDefault: string | null;
  colpatriaGrupoOcupacionDefault: string | null;
  colpatriaTipoOcupacionDefault: string | null;
  nivelesPermitidos: Array<{
    nivel: string;
    colpatriaCentroTrabajo: string | null;
    colpatriaGrupoOcupacion: string | null;
    colpatriaTipoOcupacion: string | null;
  }>;
};

function resolverConfig(empresa: EmpresaConColpatria, nivelAfiliacion: string): ConfigResuelta {
  // Asume que el caller validó que todos los defaults están seteados
  // (procesarCommand lo hace antes de llegar aquí).
  const mapeo = empresa.nivelesPermitidos.find((m) => m.nivel === nivelAfiliacion);
  return {
    aplicacion: empresa.colpatriaAplicacion!,
    perfil: empresa.colpatriaPerfil!,
    empresaIdInterno: empresa.colpatriaEmpresaIdInterno!,
    afiliacionId: empresa.colpatriaAfiliacionId!,
    nitEmpresaMision: empresa.nit,
    codigoSucursal: empresa.colpatriaCodigoSucursalDefault!,
    codigoCentroTrabajo: mapeo?.colpatriaCentroTrabajo ?? empresa.colpatriaCodigoSucursalDefault!,
    tipoAfiliacion: empresa.colpatriaTipoAfiliacionDefault!,
    grupoOcupacion: mapeo?.colpatriaGrupoOcupacion ?? empresa.colpatriaGrupoOcupacionDefault!,
    tipoOcupacion: mapeo?.colpatriaTipoOcupacion ?? empresa.colpatriaTipoOcupacionDefault!,
    // Quemados — el bot decide
    tipoSalario: '1',
    modalidadTrabajo: '01',
    tareaAltoRiesgo: '0000001',
  };
}
