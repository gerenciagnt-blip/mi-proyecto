import { prisma, type TipoEntidadSgss } from '@pila/db';
import { decrypt } from '../lib/crypto.js';
import { abrirBrowser, nuevoContext, cerrarTodo } from '../lib/browser.js';
import { cargarSesion, guardarSesion, invalidarSesion } from '../lib/session.js';
import { loginCompleto, sesionValida } from '../pages/login.js';
import { verificarEmpleado } from '../pages/ingreso-individual.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('scrape-codigos-axa');

/**
 * Lee las options de los selects `#EpsAfiliado` y `#AfpAfiliado` del
 * portal AXA Colpatria (módulo Ingreso Individual) y mapea cada
 * opción a la entidad correspondiente en BD por nombre normalizado.
 *
 * Estrategia:
 *   1. Login con la empresa indicada (reusa sesión cacheada si la hay).
 *   2. Navega a IngresoIndividual y dispara BUSCAR con un documento
 *      DUMMY (tipo CC, número "0000000000") — AXA contesta "NUEVO" y
 *      renderea el form completo con los selects ya poblados.
 *   3. Lee `<option>` de #EpsAfiliado (tipo EPS) y #AfpAfiliado (AFP),
 *      capturando `{ value, text }` de cada una.
 *   4. Para cada opción: normaliza el text (sin acentos, lowercase,
 *      stripping de prefijos típicos como "EPS ", "AFP ") y busca en
 *      BD por (tipo, nombre normalizado).
 *   5. Si match → setea `codigoAxa = option.value` (a menos que ya
 *      tenga uno y `--force` no esté activo).
 *   6. Reporta: actualizados, ya tenían el mismo, conflicto, sin match.
 *
 * Flags:
 *   --empresa-id <id>   Empresa con credenciales válidas para login.
 *   --dry-run           No escribe en BD, solo muestra qué haría.
 *   --force             Sobrescribe codigoAxa aun si ya estaba seteado.
 */
type ScrapedOption = { value: string; text: string };
type ScrapedSelects = { eps: ScrapedOption[]; afp: ScrapedOption[] };

/**
 * Stopwords que aparecen en nombres oficiales/legales pero no aportan
 * al match. Se quitan al normalizar para que "Eps Salud Total" matchee
 * con "SALUD TOTAL S.A. E.P.S" y similares.
 */
const STOPWORDS = new Set([
  'eps',
  'epss',
  'epsi',
  'afp',
  'arl',
  'ccf', // tipos
  'sa',
  'sas',
  'ltda',
  'esp',
  'ess', // formas societarias
  'e',
  'p',
  's',
  'a',
  'i', // letras sueltas tras strip de puntos
  'la',
  'el',
  'de',
  'del',
  'y', // artículos / conectores
]);

/**
 * Núcleo de palabras significativas — robusto a diferencias de
 * mayúsculas, acentos, puntuación, sufijos legales (S.A., E.P.S.) y
 * orden interno. "Eps Salud Total" y "SALUD TOTAL S.A. E.P.S" → "salud total".
 */
const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,;:_\-/\\&()'"]/g, ' ') // puntuación → espacio
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t))
    .sort() // orden alfabético: matchea aunque las palabras vayan en distinto orden
    .join(' ')
    .trim();

export async function scrapeCodigosAxaCommand(options: {
  empresaId: string;
  dryRun?: boolean;
  force?: boolean;
}): Promise<number> {
  const inicio = Date.now();
  log.info({ options }, 'iniciando scrape');

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
  if (
    !empresa ||
    !empresa.colpatriaUsuario ||
    !empresa.colpatriaPasswordEnc ||
    !empresa.colpatriaAplicacion ||
    !empresa.colpatriaPerfil ||
    !empresa.colpatriaEmpresaIdInterno ||
    !empresa.colpatriaAfiliacionId
  ) {
    console.error('❌ Empresa no encontrada o sin credenciales/selectores Colpatria');
    await prisma.$disconnect();
    return 2;
  }

  let password: string;
  try {
    password = decrypt(empresa.colpatriaPasswordEnc);
  } catch {
    console.error('❌ COLPATRIA_ENC_KEY cambió o password corrupto');
    await prisma.$disconnect();
    return 3;
  }

  console.log(`\n🔍 Scrape códigos AXA — empresa ${empresa.nit} ${empresa.nombre}`);
  if (options.dryRun) console.log('   (dry-run: no se escribe en BD)');
  if (options.force) console.log('   (force: sobrescribe codigoAxa existente)');

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
          aplicacion: empresa.colpatriaAplicacion,
          perfil: empresa.colpatriaPerfil,
          empresaIdInterno: empresa.colpatriaEmpresaIdInterno,
          afiliacionId: empresa.colpatriaAfiliacionId,
        },
      );
      await guardarSesion(empresa.id, context);
    } else {
      console.log('\n♻  Sesión cacheada válida — reusando');
    }

    // BUSCAR con doc dummy → AXA renderea formIngreso en blanco con
    // todos los selects ya cargados desde el catálogo del portal.
    console.log('\n🔍 BUSCAR doc dummy para llegar al form...');
    const verif = await verificarEmpleado(page, {
      tipoIdentificacion: '1',
      documento: '0000000000',
    });
    if (verif.kind === 'ERROR') {
      console.error(`❌ BUSCAR falló: ${verif.mensaje}`);
      exitCode = 3;
      return exitCode;
    }
    if (verif.kind === 'EXISTE') {
      console.error(
        '❌ El doc dummy "0000000000" existe como empleado en AXA — improbable. Cambiar el dummy en el código.',
      );
      exitCode = 3;
      return exitCode;
    }

    console.log('\n📋 Leyendo selects #EpsAfiliado y #AfpAfiliado...');
    // Importante: NO declarar funciones nombradas dentro del evaluate.
    // tsx con keepNames inyecta __name() que rompe en el browser. Arrows
    // inline en .map/.filter no disparan ese problema.
    const scraped: ScrapedSelects = await page.evaluate(() => {
      const epsEl = document.querySelector('#EpsAfiliado') as HTMLSelectElement | null;
      const afpEl = document.querySelector('#AfpAfiliado') as HTMLSelectElement | null;
      const eps = epsEl
        ? Array.from(epsEl.options)
            .map((o) => ({ value: o.value, text: o.text.trim() }))
            .filter((o) => o.value && !/seleccione/i.test(o.text))
        : [];
      const afp = afpEl
        ? Array.from(afpEl.options)
            .map((o) => ({ value: o.value, text: o.text.trim() }))
            .filter((o) => o.value && !/seleccione/i.test(o.text))
        : [];
      return { eps, afp };
    });

    console.log(`   EPS: ${scraped.eps.length} opciones · AFP: ${scraped.afp.length} opciones`);

    // Match contra BD + reporte
    const stats = {
      EPS: { actualizadas: 0, igual: 0, conflicto: 0, sinMatch: 0 },
      AFP: { actualizadas: 0, igual: 0, conflicto: 0, sinMatch: 0 },
    };
    const sinMatchDetail: Array<{ tipo: string; text: string; value: string }> = [];

    for (const tipo of ['EPS', 'AFP'] as const) {
      const opts = tipo === 'EPS' ? scraped.eps : scraped.afp;
      const enBd = await prisma.entidadSgss.findMany({
        where: { tipo: tipo as TipoEntidadSgss },
        select: { id: true, nombre: true, codigoAxa: true },
      });
      // Doble índice: match exacto por núcleo, y match sin espacios
      // (recupera casos como "Asmet Salud" vs "Asmetsalud").
      const bdByNorm = new Map(enBd.map((e) => [norm(e.nombre), e]));
      const bdByNormNoSpace = new Map(enBd.map((e) => [norm(e.nombre).replace(/\s+/g, ''), e]));

      console.log(`\n--- ${tipo} ---`);
      // Pasada 1: agrupar matches por entidad para detectar duplicados.
      type MatchInfo = { opt: ScrapedOption; ent: (typeof enBd)[number] };
      const matchesPorEntidad = new Map<string, MatchInfo[]>();
      for (const opt of opts) {
        const portalNorm = norm(opt.text);
        const ent = bdByNorm.get(portalNorm) ?? bdByNormNoSpace.get(portalNorm.replace(/\s+/g, ''));
        if (!ent) {
          stats[tipo].sinMatch++;
          sinMatchDetail.push({ tipo, text: opt.text, value: opt.value });
          continue;
        }
        const arr = matchesPorEntidad.get(ent.id) ?? [];
        arr.push({ opt, ent });
        matchesPorEntidad.set(ent.id, arr);
      }

      // Pasada 2: aplicar / reportar.
      for (const matches of matchesPorEntidad.values()) {
        if (matches.length > 1) {
          // Múltiples opciones del portal matchearon con una sola entidad.
          // No actualizar ninguna — el operador decide cuál es correcta.
          console.log(`  ⚠ Múltiples matches para ${matches[0]!.ent.nombre} — no se actualiza:`);
          for (const m of matches) {
            console.log(`     · "${m.opt.text}" (value=${m.opt.value})`);
          }
          stats[tipo].conflicto += matches.length;
          continue;
        }
        const { opt, ent } = matches[0]!;
        if (ent.codigoAxa === opt.value) {
          stats[tipo].igual++;
          continue;
        }
        if (ent.codigoAxa && !options.force) {
          console.log(
            `  ⚠ conflicto · ${ent.nombre}: bd=${ent.codigoAxa} vs axa=${opt.value} (usar --force para sobrescribir)`,
          );
          stats[tipo].conflicto++;
          continue;
        }
        if (options.dryRun) {
          console.log(`  → ${ent.nombre}: ${ent.codigoAxa ?? '(vacío)'} → ${opt.value} [dry-run]`);
        } else {
          await prisma.entidadSgss.update({
            where: { id: ent.id },
            data: { codigoAxa: opt.value },
          });
          console.log(`  ✓ ${ent.nombre}: ${ent.codigoAxa ?? '(vacío)'} → ${opt.value}`);
        }
        stats[tipo].actualizadas++;
      }
    }

    console.log('\n📊 Resumen:');
    for (const t of ['EPS', 'AFP'] as const) {
      const s = stats[t];
      console.log(
        `  ${t}: ${s.actualizadas} actualizadas · ${s.igual} ya iguales · ${s.conflicto} conflictos · ${s.sinMatch} sin match en BD`,
      );
    }

    if (sinMatchDetail.length > 0) {
      console.log('\n⚠ Opciones del portal sin match en BD (verificar nombres / agregar manual):');
      for (const m of sinMatchDetail) console.log(`  · [${m.tipo}] "${m.text}" (value=${m.value})`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Excepción: ${msg}`);
    if (err instanceof Error && err.stack) console.error(err.stack);
    exitCode = 3;
  } finally {
    await cerrarTodo(browser, context);
    await prisma.$disconnect();
  }

  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`\n⏱  Duración: ${dur}s`);
  return exitCode;
}
