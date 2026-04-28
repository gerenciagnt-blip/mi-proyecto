import { prisma } from '@pila/db';
import { invalidarSesion } from '../lib/session.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('logout-auto');

/**
 * Cierre automático de sesiones cacheadas.
 *
 * Política: corre Lun–Sáb 9:00 PM Colombia desde GitHub Actions.
 *
 * Estrategia: borramos el `storageState` cifrado en `ColpatriaSesion` para
 * todas las empresas. NO navegamos al portal AXA — el cierre real ocurre
 * server-side cuando AXA expira las cookies por inactividad. Lo importante
 * para nosotros es:
 *   - Dejar la BD limpia al final del día (no arrastrar cookies de la
 *     jornada anterior a la mañana siguiente).
 *   - Forzar que el `login-auto` de las 7 AM del día siguiente haga login
 *     fresco — así las credenciales se prueban diariamente y cualquier
 *     cuenta bloqueada/cambiada se detecta temprano.
 *
 * Esta operación es muy rápida (1 DELETE por empresa) y no requiere abrir
 * browser. Por eso es seguro correrla aunque haya jobs en cola — los jobs
 * que corran después del cierre simplemente harán login al inicio de la
 * tanda.
 *
 * Exit code 0 siempre (operación idempotente; "sin sesiones" no es error).
 */
export async function logoutAutoCommand(): Promise<number> {
  const inicio = Date.now();
  console.log('\n🌙 Bot Colpatria — cierre de sesiones cacheadas\n');

  const sesiones = await prisma.colpatriaSesion.findMany({
    select: {
      empresaId: true,
      expiraEn: true,
      empresa: { select: { nit: true, nombre: true } },
    },
    orderBy: { empresa: { nit: 'asc' } },
  });

  if (sesiones.length === 0) {
    console.log('   (Sin sesiones activas — nada que cerrar.)\n');
    await prisma.$disconnect();
    return 0;
  }

  console.log(`   ${sesiones.length} sesión(es) activa(s):\n`);

  let cerradas = 0;
  for (const s of sesiones) {
    const tag = `${s.empresa.nit} ${s.empresa.nombre}`;
    process.stdout.write(`   • ${tag} ... `);
    try {
      await invalidarSesion(s.empresaId);
      console.log('✅');
      cerradas++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`⚠  ${msg}`);
      log.warn({ empresaId: s.empresaId, err: msg }, 'falló invalidar sesión');
    }
  }

  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`\n📊 ${cerradas}/${sesiones.length} sesión(es) cerrada(s) · ${dur}s\n`);

  await prisma.$disconnect();
  return 0;
}
