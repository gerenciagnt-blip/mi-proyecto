import { prisma } from '@pila/db';
import { decrypt } from '../lib/crypto.js';
import { abrirBrowser, nuevoContext, cerrarTodo } from '../lib/browser.js';
import { guardarSesion, invalidarSesion } from '../lib/session.js';
import { loginCompleto, sesionValida } from '../pages/login.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('login-auto');

/**
 * Login automático en cron de TODAS las empresas con Colpatria activo.
 *
 * Política: corre Lun–Sáb 7:00 AM Colombia desde GitHub Actions.
 * Para cada empresa:
 *   1. Lee credenciales + selectores AXA del modelo Empresa.
 *   2. Abre browser fresco (no reusa la cache cuando el cron es el que
 *      establece la sesión del día — si la cache existe la sobrescribimos).
 *   3. Ejecuta `loginCompleto` y guarda el `storageState` cifrado en
 *      `ColpatriaSesion`.
 *   4. Si falla, invalida la cache vieja para evitar dejar credenciales
 *      caducas y reporta el fallo en el resumen.
 *
 * Este cron es PROACTIVO: deja a las empresas con sesión cacheada antes
 * de que arranquen los procesadores de jobs cada 15 min, así la primera
 * tanda de la jornada no paga el costo del login.
 *
 * Procesa secuencialmente (no en paralelo) — abrir N browsers en paralelo
 * en un runner de GH Actions agota memoria y AXA puede leerlo como tráfico
 * sospechoso.
 *
 * Exit codes:
 *   0 → todas las empresas hicieron login OK (o no había ninguna configurada)
 *   1 → al menos una empresa falló (las demás sí lograron sesión)
 */
export async function loginAutoCommand(): Promise<number> {
  const inicio = Date.now();
  console.log('\n🌅 Bot Colpatria — login automático de empresas activas\n');

  const empresas = await prisma.empresa.findMany({
    where: {
      active: true,
      colpatriaActivo: true,
      colpatriaUsuario: { not: null },
      colpatriaPasswordEnc: { not: null },
      colpatriaAplicacion: { not: null },
      colpatriaPerfil: { not: null },
      colpatriaEmpresaIdInterno: { not: null },
      colpatriaAfiliacionId: { not: null },
    },
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
    orderBy: { createdAt: 'asc' },
  });

  if (empresas.length === 0) {
    console.log('   (Sin empresas Colpatria activas — nada que hacer.)\n');
    await prisma.$disconnect();
    return 0;
  }

  console.log(`   ${empresas.length} empresa(s) configurada(s):\n`);

  let exitos = 0;
  let fallos = 0;
  const errores: Array<{ empresa: string; error: string }> = [];

  for (const empresa of empresas) {
    const tag = `${empresa.nit} ${empresa.nombre}`;
    process.stdout.write(`   • ${tag} ... `);

    let password: string;
    try {
      password = decrypt(empresa.colpatriaPasswordEnc!);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ password no descifra (${msg})`);
      errores.push({ empresa: tag, error: `decrypt: ${msg}` });
      fallos++;
      continue;
    }

    const browser = await abrirBrowser();
    const context = await nuevoContext(browser);
    const page = await context.newPage();

    try {
      await loginCompleto(
        page,
        { usuario: empresa.colpatriaUsuario!, password },
        {
          aplicacion: empresa.colpatriaAplicacion!,
          perfil: empresa.colpatriaPerfil!,
          empresaIdInterno: empresa.colpatriaEmpresaIdInterno!,
          afiliacionId: empresa.colpatriaAfiliacionId!,
        },
      );

      const valida = await sesionValida(page);
      if (!valida) throw new Error('login OK pero sesionValida=false al verificar portal interno');

      await guardarSesion(empresa.id, context);
      console.log('✅ sesión cacheada');
      log.info({ empresaId: empresa.id, nit: empresa.nit }, 'login auto OK');
      exitos++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ ${msg}`);
      log.warn({ empresaId: empresa.id, nit: empresa.nit, err: msg }, 'login auto falló');
      errores.push({ empresa: tag, error: msg });
      // Si tenía sesión vieja, no la dejemos huérfana después de un fallo.
      await invalidarSesion(empresa.id).catch(() => {});
      fallos++;
    } finally {
      await cerrarTodo(browser, context).catch(() => {});
    }
  }

  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`\n📊 Resumen: ${exitos} OK · ${fallos} fallo(s) · ${dur}s`);

  if (errores.length > 0) {
    console.log('\nDetalle de fallos:');
    for (const e of errores) console.log(`   - ${e.empresa}: ${e.error}`);
  }
  console.log('');

  await prisma.$disconnect();
  return fallos > 0 ? 1 : 0;
}
