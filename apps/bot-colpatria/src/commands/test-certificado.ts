import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { Page } from 'playwright';
import { prisma } from '@pila/db';
import { decrypt } from '../lib/crypto.js';
import { abrirBrowser, nuevoContext, cerrarTodo } from '../lib/browser.js';
import { cargarSesion, guardarSesion, invalidarSesion } from '../lib/session.js';
import { loginCompleto, sesionValida } from '../pages/login.js';
import { descargarCertificadoVigente } from '../pages/certificado-vigente.js';
import { mapearTipoDocumento } from '../lib/payload-form.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('test-certificado');

/**
 * Prueba de descarga del certificado de afiliación vigente — debug
 * standalone, NO toca BD ni la cola de jobs. Útil para descubrir/
 * validar selectores del módulo de Consulta del portal AXA antes de
 * conectar el comando productivo `descargar-certificados`.
 *
 * Modos de identificación del cotizante:
 *   --documento <num> [--tipo-doc <CC|CE|TI|...>]
 *   --afiliacion-id <id>   (resuelve tipo+número desde BD)
 *
 * Exit codes:
 *   0 → PDF descargado y guardado
 *   1 → input inválido
 *   2 → empresa o afiliación no encontradas
 *   3 → error en portal (login, búsqueda, descarga)
 */
export async function testCertificadoCommand(options: {
  empresaId: string;
  documento?: string;
  tipoDoc?: string;
  afiliacionId?: string;
  output?: string;
  screenshot?: string;
  keepOpen?: boolean;
}): Promise<number> {
  const inicio = Date.now();
  log.info({ options }, 'iniciando test-certificado');

  const empresa = await prisma.empresa.findUnique({
    where: { id: options.empresaId },
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
  });

  if (!empresa || !empresa.colpatriaUsuario || !empresa.colpatriaPasswordEnc) {
    console.error('❌ Empresa no encontrada o sin credenciales Colpatria');
    await prisma.$disconnect();
    return 2;
  }

  // Resolver tipo+documento del cotizante
  let tipoPila: string;
  let numeroDoc: string;
  if (options.afiliacionId) {
    const af = await prisma.afiliacion.findUnique({
      where: { id: options.afiliacionId },
      select: {
        cotizante: { select: { tipoDocumento: true, numeroDocumento: true } },
      },
    });
    if (!af) {
      console.error(`❌ Afiliación ${options.afiliacionId} no encontrada`);
      await prisma.$disconnect();
      return 2;
    }
    tipoPila = af.cotizante.tipoDocumento;
    numeroDoc = af.cotizante.numeroDocumento;
  } else if (options.documento) {
    tipoPila = options.tipoDoc ?? 'CC';
    numeroDoc = options.documento;
  } else {
    console.error('❌ Pasa --documento <num> o --afiliacion-id <id>');
    await prisma.$disconnect();
    return 1;
  }

  let tipoAxa: string;
  try {
    tipoAxa = mapearTipoDocumento(tipoPila);
  } catch (e) {
    console.error(`❌ ${e instanceof Error ? e.message : e}`);
    await prisma.$disconnect();
    return 1;
  }

  console.log(`\n🔍 Test certificado vigente`);
  console.log(`   empresa:   ${empresa.nit} — ${empresa.nombre}`);
  console.log(`   cotizante: ${tipoPila} ${numeroDoc} (tipoAxa=${tipoAxa})`);

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

    console.log('\n📋 Buscando empleado en Consulta...');
    const r = await descargarCertificadoVigente(page, {
      tipoIdentificacion: tipoAxa,
      documento: numeroDoc,
    });

    if (r.kind === 'OK') {
      const out = resolve(options.output ?? './certificado.pdf');
      await writeFile(out, r.pdf);
      console.log(`✅ PDF guardado: ${out} (${r.pdf.length} bytes)`);
    } else if (r.kind === 'NO_EXISTE') {
      console.error(`❌ El empleado no existe en AXA — verificar que la afiliación esté creada`);
      exitCode = 1;
    } else {
      console.error(`❌ Error: ${r.mensaje}`);
      exitCode = 3;
    }

    await tomarScreenshot(page, options.screenshot);

    if (options.keepOpen) {
      console.log('\n⏸  --keep-open: browser abierto. Ctrl+C para terminar.');
      await new Promise(() => {});
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Excepción: ${msg}`);
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
