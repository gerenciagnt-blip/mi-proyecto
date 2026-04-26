import { resolve } from 'node:path';
import { prisma } from '@pila/db';
import { decrypt } from '../lib/crypto.js';
import { abrirBrowser, nuevoContext, cerrarTodo } from '../lib/browser.js';
import { cargarSesion, guardarSesion, invalidarSesion } from '../lib/session.js';
import { loginCompleto, sesionValida, URLS } from '../pages/login.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('test-login');

/**
 * Prueba el login + paso /Bienvenida contra el portal real para UNA
 * empresa. NO toca jobs, NO modifica BD (excepto guardar la sesión
 * cacheada si el login fue OK).
 *
 * Pasos:
 *   1. Lee la config Colpatria de la empresa
 *   2. Si hay sesión cacheada, la prueba primero (modo "verificación")
 *   3. Si no hay o está rota, hace login fresco
 *   4. Toma screenshot del estado final
 *   5. Reporta resumen y exit code
 *
 * Exit codes:
 *   0 → login OK
 *   1 → config incompleta
 *   2 → empresa no encontrada / no tiene credenciales
 *   3 → login falló (credenciales malas, portal caído, etc.)
 */
export async function testLoginCommand(options: {
  empresaId: string;
  screenshot?: string;
  keepOpen?: boolean;
}): Promise<number> {
  const inicio = Date.now();
  log.info({ empresaId: options.empresaId }, 'iniciando test-login');

  // 1. Cargar empresa + config
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
    },
  });

  if (!empresa) {
    log.error({ empresaId: options.empresaId }, 'empresa no encontrada en BD');
    await prisma.$disconnect();
    return 2;
  }

  console.log(`\n🔐 Test login Colpatria para empresa ${empresa.nit} — ${empresa.nombre}\n`);

  if (!empresa.colpatriaUsuario || !empresa.colpatriaPasswordEnc) {
    console.error('❌ La empresa no tiene credenciales Colpatria configuradas.');
    console.error('   Configúralas en /admin/empresas/' + empresa.id + '/colpatria');
    await prisma.$disconnect();
    return 2;
  }

  if (
    !empresa.colpatriaAplicacion ||
    !empresa.colpatriaPerfil ||
    !empresa.colpatriaEmpresaIdInterno ||
    !empresa.colpatriaAfiliacionId
  ) {
    console.error('❌ La empresa no tiene los selectores AXA completos.');
    console.error('   Faltantes:');
    if (!empresa.colpatriaAplicacion) console.error('     - colpatriaAplicacion');
    if (!empresa.colpatriaPerfil) console.error('     - colpatriaPerfil');
    if (!empresa.colpatriaEmpresaIdInterno) console.error('     - colpatriaEmpresaIdInterno');
    if (!empresa.colpatriaAfiliacionId) console.error('     - colpatriaAfiliacionId');
    console.error('   Configúralos en /admin/empresas/' + empresa.id + '/colpatria');
    await prisma.$disconnect();
    return 1;
  }

  let password: string;
  try {
    password = decrypt(empresa.colpatriaPasswordEnc);
  } catch (err) {
    console.error(
      `❌ No se pudo descifrar el password (¿COLPATRIA_ENC_KEY cambió?): ${err instanceof Error ? err.message : err}`,
    );
    await prisma.$disconnect();
    return 3;
  }

  console.log(`   usuario: ${empresa.colpatriaUsuario}`);
  console.log(`   aplicación: ${empresa.colpatriaAplicacion}`);
  console.log(`   perfil: ${empresa.colpatriaPerfil}`);
  console.log(`   empresa AXA: ${empresa.colpatriaEmpresaIdInterno}`);
  console.log(`   afiliación AXA: ${empresa.colpatriaAfiliacionId}\n`);

  // 2. Abrir browser
  const browser = await abrirBrowser();
  const sesionCacheada = await cargarSesion(empresa.id);
  const context = await nuevoContext(browser, sesionCacheada ?? undefined);
  const page = await context.newPage();

  let exitCode = 0;
  try {
    // 3. Si tenemos sesión cacheada, primero la probamos
    if (sesionCacheada) {
      console.log('🔁 Probando sesión cacheada...');
      const valida = await sesionValida(page);
      if (valida) {
        console.log('✅ Sesión cacheada válida — login no fue necesario.');
        await tomarScreenshot(page, options.screenshot);
        log.info({ duracionMs: Date.now() - inicio }, 'test OK (con cache)');
        return 0;
      }
      console.log('⚠  Sesión cacheada expirada, haciendo login fresco...');
      await invalidarSesion(empresa.id);
    }

    // 4. Login fresco
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

    // 5. Validar que llegamos al portal interno
    console.log('\n🌐 Verificando acceso al portal interno...');
    const valida = await sesionValida(page);
    if (!valida) {
      console.error('❌ Login parecía OK pero al ir a /IngresoIndividual nos rebotó al login.');
      exitCode = 3;
    } else {
      console.log(`✅ En portal interno — URL: ${page.url()}`);

      // 6. Guardar sesión para reuso
      await guardarSesion(empresa.id, context);
      console.log('💾 Sesión guardada para próximas corridas.');
    }

    await tomarScreenshot(page, options.screenshot);

    if (options.keepOpen) {
      console.log('\n⏸  --keep-open: el browser queda abierto. Cierra manualmente para terminar.');
      // Esperar indefinidamente — el usuario cierra con Ctrl+C
      await new Promise(() => {});
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Error en login: ${msg}`);
    exitCode = 3;

    // Intentamos screenshot del estado de error para diagnóstico
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

async function tomarScreenshot(
  page: import('playwright').Page,
  ruta: string | undefined,
): Promise<void> {
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
