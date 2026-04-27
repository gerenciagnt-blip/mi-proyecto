import { resolve } from 'node:path';
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
import type { Page } from 'playwright';

const log = createLogger('test-ingreso');

/**
 * Prueba el flujo completo de Ingreso Individual contra el portal real,
 * para UN job (o un job sintético construido a mano).
 *
 * Modos:
 *   --job-id <id>     → toma un job real existente en BD
 *   --afiliacion <id> → arma el payload on-the-fly desde la afiliación
 *
 * El flujo:
 *   1. Carga empresa + config + payload
 *   2. Login (con cache de sesión)
 *   3. Navega a /IngresoIndividual + BUSCAR (verificarEmpleado)
 *   4. Si NUEVO: llena form + submit
 *   5. Reporta resultado + screenshot
 *
 * **NO modifica el job en BD** — es debug, solo logs/screenshot.
 *
 * Exit codes:
 *   0 → ingreso OK
 *   1 → config incompleta / payload inválido
 *   2 → empresa o afiliación no encontradas
 *   3 → fallo en portal (login, BUSCAR, llenado, submit)
 */
export async function testIngresoCommand(options: {
  empresaId: string;
  jobId?: string;
  afiliacionId?: string;
  /** Alternativa a --afiliacion-id: buscar la afiliación por número
   *  de documento del cotizante (mucho más práctico — el ADMIN lo
   *  conoce). Si hay varias afiliaciones para ese doc en la empresa,
   *  toma la más reciente ACTIVA. */
  documento?: string;
  screenshot?: string;
  keepOpen?: boolean;
  /** Códigos AXA opcionales — el payload no los trae, el operador
   *  los puede pasar manualmente para probar el flujo end-to-end. */
  epsCodigoAxa?: string;
  afpCodigoAxa?: string;
}): Promise<number> {
  const inicio = Date.now();
  log.info({ options }, 'iniciando test-ingreso');

  const empresa = await prisma.empresa.findUnique({
    where: { id: options.empresaId },
    select: {
      id: true,
      nit: true,
      nombre: true,
      colpatriaActivo: true,
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
  });

  if (!empresa || !empresa.colpatriaUsuario || !empresa.colpatriaPasswordEnc) {
    console.error('❌ Empresa no encontrada o sin credenciales Colpatria');
    await prisma.$disconnect();
    return 2;
  }

  // Construir payload: desde job real o desde afiliación
  let payload: ColpatriaPayload;
  if (options.jobId) {
    const job = await prisma.colpatriaAfiliacionJob.findUnique({
      where: { id: options.jobId },
      select: { payload: true, empresaId: true, afiliacionId: true },
    });
    if (!job) {
      console.error(`❌ Job ${options.jobId} no encontrado`);
      await prisma.$disconnect();
      return 2;
    }
    payload = job.payload as unknown as ColpatriaPayload;
  } else if (options.afiliacionId) {
    payload = await construirPayloadDesdeAfiliacion(options.afiliacionId);
  } else if (options.documento) {
    // Resolución por documento del cotizante: tomar la afiliación
    // ACTIVA más reciente del cotizante en la empresa de --empresa-id
    const afId = await resolverAfiliacionPorDocumento(options.documento, options.empresaId);
    if (!afId) {
      console.error(
        `❌ No se encontró afiliación ACTIVA del cotizante con documento "${options.documento}" en esa empresa`,
      );
      await prisma.$disconnect();
      return 2;
    }
    console.log(`   ↳ Resuelto: afiliación ${afId} (cotizante doc=${options.documento})`);
    payload = await construirPayloadDesdeAfiliacion(afId);
  } else {
    console.error('❌ Pasa --job-id <id>, --afiliacion-id <id> o --documento <numDoc>');
    await prisma.$disconnect();
    return 1;
  }

  // Validar payload
  const erroresPayload = validarPayloadParaIngreso(payload);
  if (erroresPayload.length > 0) {
    console.error('❌ Payload inválido:');
    for (const e of erroresPayload) console.error('   · ' + e);
    await prisma.$disconnect();
    return 1;
  }

  // Resolver config (replica config-resolver de @pila/web — el bot no
  // puede importar de web cross-app, así que lo replicamos inline)
  const config = resolverConfig(empresa, payload.afiliacion.nivelRiesgo);
  if (!config) {
    console.error('❌ Config Colpatria de empresa incompleta');
    await prisma.$disconnect();
    return 1;
  }

  console.log(`\n🔧 Test ingreso individual`);
  console.log(`   empresa: ${empresa.nit} — ${empresa.nombre}`);
  console.log(
    `   cotizante: ${payload.afiliacion.cotizante.tipoDocumento} ${payload.afiliacion.cotizante.numeroDocumento}`,
  );
  console.log(
    `   nombre: ${payload.afiliacion.cotizante.primerNombre} ${payload.afiliacion.cotizante.primerApellido}`,
  );
  console.log(
    `   nivel riesgo: ${payload.afiliacion.nivelRiesgo} → centro ${config.codigoCentroTrabajo}`,
  );
  console.log(
    `   grupo: ${config.grupoOcupacion} · tipo: ${config.tipoOcupacion} · cargo: ${payload.afiliacion.cargo}`,
  );

  let password: string;
  try {
    password = decrypt(empresa.colpatriaPasswordEnc);
  } catch {
    console.error('❌ COLPATRIA_ENC_KEY cambió o password corrupto');
    await prisma.$disconnect();
    return 3;
  }

  const browser = await abrirBrowser();
  const sesionCacheada = await cargarSesion(empresa.id);
  const context = await nuevoContext(browser, sesionCacheada ?? undefined);
  const page = await context.newPage();

  let exitCode = 0;
  try {
    // Login (con reuso de sesión)
    let necesitaLogin = !sesionCacheada;
    if (sesionCacheada) {
      const valida = await sesionValida(page);
      if (!valida) {
        await invalidarSesion(empresa.id);
        necesitaLogin = true;
      }
    }
    if (necesitaLogin) {
      console.log('\n🔐 Login...');
      await loginCompleto(
        page,
        { usuario: empresa.colpatriaUsuario, password },
        {
          aplicacion: empresa.colpatriaAplicacion!,
          perfil: empresa.colpatriaPerfil!,
          empresaIdInterno: empresa.colpatriaEmpresaIdInterno!,
          afiliacionId: empresa.colpatriaAfiliacionId!,
        },
      );
      await guardarSesion(empresa.id, context);
    } else {
      console.log('\n♻  Sesión cacheada válida — reusando');
    }

    // Verificar empleado (formConsulta)
    console.log('\n🔍 BUSCAR empleado...');
    const campos = prepararCamposIngreso(payload, config);
    if (campos.warnings.length > 0) {
      for (const w of campos.warnings) console.log(`   ⚠ ${w}`);
    }

    const verif = await verificarEmpleado(page, campos.consulta);
    if (verif.kind === 'ERROR') {
      console.error(`❌ BUSCAR falló: ${verif.mensaje}`);
      exitCode = 3;
    } else if (verif.kind === 'EXISTE') {
      console.error(
        `❌ Empleado ya existe en AXA (ID_OPERACION=${verif.idOperacion}). REACTIVAR no implementado.`,
      );
      exitCode = 1;
    } else {
      console.log('✅ Empleado nuevo — formIngreso renderizado');

      // Llenar y crear
      console.log('\n📝 Llenando formIngreso...');
      const res = await llenarYCrearEmpleado(page, campos, {
        epsCodigoAxa: options.epsCodigoAxa,
        afpCodigoAxa: options.afpCodigoAxa,
      });

      if (res.warnings.length > 0) {
        for (const w of res.warnings) console.log(`   ⚠ ${w}`);
      }

      if (res.ok) {
        console.log(`✅ Submit OK — URL final: ${res.urlFinal}`);
        if (res.mensaje) console.log(`   mensaje portal: ${res.mensaje}`);
      } else {
        console.error(`❌ Submit falló — URL: ${res.urlFinal}`);
        if (res.mensaje) console.error(`   mensaje portal: ${res.mensaje}`);
        exitCode = 3;
      }
    }

    await tomarScreenshot(page, options.screenshot);

    if (options.keepOpen) {
      console.log('\n⏸  --keep-open: browser abierto. Ctrl+C para terminar.');
      await new Promise(() => {});
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Excepción en test-ingreso: ${msg}`);
    if (err instanceof Error && err.stack) console.error(err.stack);
    exitCode = 3;
    await tomarScreenshot(page, options.screenshot);
  } finally {
    if (!options.keepOpen) {
      await cerrarTodo(browser, context);
    }
    await prisma.$disconnect();
  }

  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`\n⏱  Duración: ${dur}s`);
  return exitCode;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Replica de `apps/web/src/lib/colpatria/config-resolver.ts > resolverConfigParaAfiliacion`.
 * El bot no puede importar de web, así que mantiene esta lógica espejo.
 * La función pura `prepararCamposIngreso` se queda en bot/lib.
 */
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

function resolverConfig(
  empresa: EmpresaConColpatria,
  nivelAfiliacion: string,
): ConfigResuelta | null {
  if (
    !empresa.colpatriaAplicacion ||
    !empresa.colpatriaPerfil ||
    !empresa.colpatriaEmpresaIdInterno ||
    !empresa.colpatriaAfiliacionId ||
    !empresa.colpatriaCodigoSucursalDefault ||
    !empresa.colpatriaTipoAfiliacionDefault ||
    !empresa.colpatriaGrupoOcupacionDefault ||
    !empresa.colpatriaTipoOcupacionDefault
  ) {
    return null;
  }

  const mapeo = empresa.nivelesPermitidos.find((m) => m.nivel === nivelAfiliacion);
  return {
    aplicacion: empresa.colpatriaAplicacion,
    perfil: empresa.colpatriaPerfil,
    empresaIdInterno: empresa.colpatriaEmpresaIdInterno,
    afiliacionId: empresa.colpatriaAfiliacionId,
    nitEmpresaMision: empresa.nit,
    codigoSucursal: empresa.colpatriaCodigoSucursalDefault,
    codigoCentroTrabajo: mapeo?.colpatriaCentroTrabajo ?? empresa.colpatriaCodigoSucursalDefault,
    tipoAfiliacion: empresa.colpatriaTipoAfiliacionDefault,
    grupoOcupacion: mapeo?.colpatriaGrupoOcupacion ?? empresa.colpatriaGrupoOcupacionDefault,
    tipoOcupacion: mapeo?.colpatriaTipoOcupacion ?? empresa.colpatriaTipoOcupacionDefault,
    // Quemados — siempre del bot, no de empresa
    tipoSalario: '1',
    modalidadTrabajo: '01',
    tareaAltoRiesgo: '0000001',
  };
}

/**
 * Construye un payload Colpatria desde una afiliación existente. Útil
 * para probar antes de que el trigger automático cree el job real.
 *
 * Mantiene el shape **idéntico** al que produce
 * `apps/web/src/lib/colpatria/disparos.ts > dispararColpatriaSiAplica`.
 * Si esa función cambia, esta también — son contractuales.
 */
async function construirPayloadDesdeAfiliacion(afiliacionId: string): Promise<ColpatriaPayload> {
  const af = await prisma.afiliacion.findUnique({
    where: { id: afiliacionId },
    select: {
      id: true,
      estado: true,
      modalidad: true,
      nivelRiesgo: true,
      salario: true,
      fechaIngreso: true,
      cargo: true,
      eps: { select: { codigoAxa: true } },
      afp: { select: { codigoAxa: true } },
      cotizante: {
        select: {
          id: true,
          tipoDocumento: true,
          numeroDocumento: true,
          primerNombre: true,
          segundoNombre: true,
          primerApellido: true,
          segundoApellido: true,
          fechaNacimiento: true,
          genero: true,
          estadoCivil: true,
          email: true,
          celular: true,
          direccion: true,
          municipio: { select: { nombre: true } },
          departamento: { select: { nombre: true } },
        },
      },
      empresa: { select: { id: true, nit: true, nombre: true } },
    },
  });
  if (!af || !af.empresa) throw new Error(`Afiliación ${afiliacionId} no encontrada o sin empresa`);

  return {
    schemaVersion: 1,
    evento: 'CREAR',
    afiliacion: {
      id: af.id,
      estado: af.estado,
      modalidad: af.modalidad,
      nivelRiesgo: af.nivelRiesgo,
      salario: af.salario.toString(),
      fechaIngreso: af.fechaIngreso.toISOString().slice(0, 10),
      cargo: af.cargo,
      epsCodigoAxa: af.eps?.codigoAxa ?? null,
      afpCodigoAxa: af.afp?.codigoAxa ?? null,
      cotizante: {
        id: af.cotizante.id,
        tipoDocumento: af.cotizante.tipoDocumento,
        numeroDocumento: af.cotizante.numeroDocumento,
        primerNombre: af.cotizante.primerNombre,
        segundoNombre: af.cotizante.segundoNombre,
        primerApellido: af.cotizante.primerApellido,
        segundoApellido: af.cotizante.segundoApellido,
        fechaNacimiento: af.cotizante.fechaNacimiento
          ? af.cotizante.fechaNacimiento.toISOString().slice(0, 10)
          : null,
        genero: af.cotizante.genero,
        estadoCivil: af.cotizante.estadoCivil,
        email: af.cotizante.email,
        celular: af.cotizante.celular,
        direccion: af.cotizante.direccion,
        municipio: af.cotizante.municipio?.nombre ?? null,
        departamento: af.cotizante.departamento?.nombre ?? null,
      },
      empresa: { id: af.empresa.id, nit: af.empresa.nit, nombre: af.empresa.nombre },
    },
  };
}

/**
 * Busca el ID de afiliación ACTIVA más reciente para un cotizante
 * (por documento) dentro de una empresa específica. Útil para que el
 * operador no tenga que copiar UUIDs de Prisma.
 *
 * Retorna null si no hay match. No filtra por modalidad (el bot solo
 * procesa DEPENDIENTE de todas formas, pero no quiero ocultar config
 * mala — si hay afiliación INDEPENDIENTE en la empresa, lo verás).
 */
async function resolverAfiliacionPorDocumento(
  documento: string,
  empresaId: string,
): Promise<string | null> {
  const af = await prisma.afiliacion.findFirst({
    where: {
      empresaId,
      estado: 'ACTIVA',
      cotizante: { numeroDocumento: documento },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  return af?.id ?? null;
}

async function tomarScreenshot(page: Page, ruta: string | undefined): Promise<void> {
  if (!ruta) return;
  const abs = resolve(ruta);
  try {
    await page.screenshot({ path: abs, fullPage: true });
    console.log(`📸 Screenshot guardado: ${abs}`);
  } catch (err) {
    log.warn(
      { ruta: abs, err: err instanceof Error ? err.message : String(err) },
      'no se pudo guardar screenshot',
    );
  }
}
