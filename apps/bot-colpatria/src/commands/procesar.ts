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
import { createLogger } from '../lib/logger.js';

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

          // Solo CREAR está implementado. REACTIVAR queda como TODO.
          if (payload.evento !== 'CREAR') {
            await marcarFallo(
              job.id,
              `Evento "${payload.evento}" no implementado (solo CREAR)`,
              false,
              Date.now() - t0,
            );
            exitFail++;
            console.log(`   · job ${job.id.slice(-8)}: evento ${payload.evento} no implementado`);
            continue;
          }

          // Verificar si el empleado ya existe (form de Consulta)
          const verif = await verificarEmpleado(page, campos.consulta);
          if (verif.kind === 'ERROR') {
            // Sesión perdida o error visible del portal
            if (verif.mensaje?.includes('Sesión expiró')) {
              throw new Error('SESION_EXPIRADA'); // capturado abajo, fuerza re-login
            }
            await marcarFallo(job.id, `BUSCAR falló: ${verif.mensaje}`, true, Date.now() - t0);
            exitFail++;
            console.log(`   · job ${job.id.slice(-8)}: BUSCAR error — ${verif.mensaje}`);
            continue;
          }
          if (verif.kind === 'EXISTE') {
            // El empleado ya está registrado en AXA — caso REACTIVAR
            // que aún no implementamos. Marcamos FAILED no-retryable.
            await marcarFallo(
              job.id,
              `Empleado ya existe en AXA (ID_OPERACION=${verif.idOperacion}); reactivación no implementada`,
              false,
              Date.now() - t0,
            );
            exitFail++;
            console.log(`   · job ${job.id.slice(-8)}: ya existía en AXA`);
            continue;
          }

          // verif.kind === 'NUEVO' — llenamos el form
          // EPS/AFP: TODO Sprint 8.5+ — por ahora pasamos sin códigos y
          // dejamos que el portal valide. El error será visible al submit.
          const res = await llenarYCrearEmpleado(page, campos);

          if (res.ok) {
            const warnings = res.warnings.length > 0 ? ` · warnings: ${res.warnings.length}` : '';
            await marcarOk(
              job.id,
              `Creado en AXA · URL: ${res.urlFinal}${res.mensaje ? ` · ${res.mensaje}` : ''}${warnings}`,
              Date.now() - t0,
            );
            exitOk++;
            console.log(`   · job ${job.id.slice(-8)}: ✅ creado`);
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

async function marcarOk(jobId: string, mensajeInfo: string, durationMs: number): Promise<void> {
  // Logueamos el mensaje a stdout/Pino. El modelo no tiene campo
  // dedicado para "output" exitoso — solo `error` (para fallos) y
  // `pdfPath` (Sprint 8.5). El estado SUCCESS + finishedAt + durationMs
  // basta para dashboards.
  log.info({ jobId, info: mensajeInfo }, 'job exitoso');
  await prisma.colpatriaAfiliacionJob.update({
    where: { id: jobId },
    data: {
      status: 'SUCCESS',
      finishedAt: new Date(),
      durationMs,
      error: null,
    },
  });
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
