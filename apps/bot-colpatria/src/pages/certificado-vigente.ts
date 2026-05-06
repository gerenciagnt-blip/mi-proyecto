import type { Page, Response, Locator } from 'playwright';
import { esperarSinOverlay } from '../lib/browser.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('certificado');

/**
 * Sprint 8.6 — Certificado de afiliación vigente.
 *
 * Flujo manual del operador en el portal AXA:
 *   Consultas y reportes → Consultas → Empleados → Opción individual
 *     → Tipo Documento + Número Documento + BUSCAR
 *     → Form bloqueado con datos del empleado
 *     → Botón "Imprimir datos básicos" → PDF inline (visor Chrome).
 *
 * Estrategia del bot:
 *   1. Si `COLPATRIA_CONSULTA_URL` está seteada (env), saltar el menú
 *      e ir directo a esa URL.
 *   2. Si no, navegar por clicks por el menú lateral. AXA típicamente
 *      lo arma con sidebar expandible — selectores tolerantes por
 *      texto visible (no por id/href que cambian entre versiones).
 *   3. Llenar el form (mismos selectores que IngresoIndividual).
 *   4. Click BUSCAR → esperar la pantalla de detalle.
 *   5. Click "Imprimir datos básicos" → capturar PDF con el patrón
 *      network-layer + firma binaria %PDF- validado en Sprint 8.5.B.
 *
 * Si el menú cambia, ajustar los textos en `RUTAS_MENU` (sin
 * redeploy si solo cambia env). Si la URL cambia y la sabés, setear
 * `COLPATRIA_CONSULTA_URL` y la navegación por clicks queda como
 * fallback nunca usado.
 */

/** Menú anidado a recorrer si no hay URL directa. Cada nivel es una
 *  lista de textos posibles (case-insensitive, primer match gana). */
const RUTAS_MENU: ReadonlyArray<readonly string[]> = [
  ['Consultas y reportes', 'Consultas y Reportes', 'Reportes y consultas'],
  ['Consultas'],
  ['Empleados', 'Empleado'],
  ['Opción individual', 'Opcion individual', 'Individual'],
];

export type ResultadoCertificado =
  | { kind: 'OK'; pdf: Buffer }
  | { kind: 'NO_EXISTE' }
  | { kind: 'ERROR'; mensaje: string };

export async function descargarCertificadoVigente(
  page: Page,
  consulta: { tipoIdentificacion: string; documento: string },
): Promise<ResultadoCertificado> {
  log.info({ consulta }, 'iniciando descarga certificado');

  const urlOverride = process.env.COLPATRIA_CONSULTA_URL;
  if (urlOverride) {
    log.info({ url: urlOverride }, 'usando COLPATRIA_CONSULTA_URL override');
    await page.goto(urlOverride, { waitUntil: 'networkidle' });
  } else {
    const navResult = await navegarPorMenu(page);
    if (navResult.kind === 'ERROR') return navResult;
  }

  if (page.url().includes('/Autenticacion/')) {
    return { kind: 'ERROR', mensaje: 'Sesión expiró antes de Consulta' };
  }

  // Form de búsqueda — selectores reales de
  // `/EmpleadoDependiente/ConsultarEmpleado` (Sprint 8.6, descubiertos
  // en runtime contra el portal real):
  //   - Tipo Documento: `#tipoDocumendo` (typo de AXA, name="EmpresaMisioId")
  //   - Número Documento: `#numDocumento` (placeholder "Ingrese el número…")
  //   - Botón: "BUSCAR"
  const tipoSelectorList = [
    '#tipoDocumendo', // typo AXA real en Consulta
    '#TipoIdentificacionSelect', // tolerar Ingreso por si cambian
    'select[name*="TipoIdentificacion" i]',
  ];
  const numeroSelectorList = [
    '#numDocumento', // Consulta
    '#txtNumeroDocumento', // Ingreso (fallback)
    'input[name*="NumeroDocumento" i]',
  ];

  const tipoLocator = page.locator(tipoSelectorList.join(', ')).first();
  // Importante: el portal AXA usa bootstrap-select, que esconde el
  // `<select>` nativo (`display:none`). isVisible() retorna false aunque
  // el elemento exista. Usar `attached` para verificar que está en el
  // DOM y `selectOption({ force: true })` para escribir el valor.
  const tipoPresente = await tipoLocator
    .waitFor({ state: 'attached', timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  if (!tipoPresente) {
    const diag = await page
      .evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select')).map((s) => ({
          id: s.id,
          name: s.name,
          opciones: Array.from(s.options)
            .slice(0, 3)
            .map((o) => o.text),
        }));
        const inputs = Array.from(document.querySelectorAll('input[type="text"]')).map((i) => ({
          id: (i as HTMLInputElement).id,
          name: (i as HTMLInputElement).name,
          placeholder: (i as HTMLInputElement).placeholder,
        }));
        return { selects: selects.slice(0, 8), inputs: inputs.slice(0, 8) };
      })
      .catch(() => ({ selects: [], inputs: [] }));

    return {
      kind: 'ERROR',
      mensaje:
        `Form de Consulta no apareció. URL=${page.url()} · ` +
        `selects=${JSON.stringify(diag.selects)} · ` +
        `inputs=${JSON.stringify(diag.inputs)}`,
    };
  }

  // Seleccionar tipo doc — probamos por value primero (códigos AXA
  // 1=CC, 2=NIT, 3=TI, etc.), y si la opción no existe, caemos a
  // selección por label. La pantalla de Consulta tiene un catálogo
  // reducido (solo Cédula y NIT en producción), distinto del Ingreso.
  await seleccionarTipoDoc(page, tipoLocator, consulta.tipoIdentificacion);

  // El input numDocumento puede estar en el DOM pero no visible (panel
  // colapsado, tab inactivo). Asignamos value directamente vía evaluate
  // y disparamos input+change para que AXA detecte el cambio. Mismo
  // truco que con el select hidden por bootstrap-select.
  const numAsignado = await page.evaluate(
    ({ selectores, value }) => {
      for (const sel of selectores) {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (el) {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return sel;
        }
      }
      return null;
    },
    { selectores: numeroSelectorList, value: consulta.documento },
  );
  if (!numAsignado) {
    return {
      kind: 'ERROR',
      mensaje: `No se encontró input de número de documento (${numeroSelectorList.join('|')})`,
    };
  }

  log.info('click BUSCAR en Consulta');
  // Mismo problema que con el input: el botón está en el DOM pero el
  // panel donde vive tiene display:none (tab inactivo), por lo que ni
  // `force: true` lo deja clickear. Disparamos el click directo via
  // evaluate — el handler JS del portal procesa el form igual.
  const buscarClicked = await page.evaluate(() => {
    const candidatos: HTMLElement[] = [];
    const byId = document.getElementById('btnBuscarIndividual');
    if (byId) candidatos.push(byId as HTMLElement);
    document.querySelectorAll('input[type="submit"], button').forEach((el) => {
      const txt = ((el as HTMLInputElement).value || (el.textContent ?? '')).trim().toUpperCase();
      if (txt === 'BUSCAR' || txt === 'BUSCAR INDIVIDUAL') {
        candidatos.push(el as HTMLElement);
      }
    });
    if (candidatos.length === 0) return false;
    candidatos[0]!.click();
    return true;
  });
  if (!buscarClicked) {
    return { kind: 'ERROR', mensaje: 'No se encontró botón BUSCAR' };
  }
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await esperarSinOverlay(page);
  await page.waitForTimeout(1500);

  // ¿Empleado existe?
  const noExiste = await page
    .locator(
      [
        'text=/no se (encontr|han encontrado).+(resultado|empleado|registro)/i',
        'text=/sin (resultados|registros)/i',
        'text=/no existe.+(empleado|registro)/i',
      ].join(', '),
    )
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (noExiste) {
    log.info('Consulta sin resultados');
    return { kind: 'NO_EXISTE' };
  }

  // Botón "Imprimir datos básicos" (Sprint 8.6 confirmado por operador).
  const btn = page
    .locator(
      [
        "button:has-text('Imprimir datos básicos')",
        "button:has-text('Imprimir Datos Básicos')",
        "button:has-text('Imprimir datos basicos')",
        "a:has-text('Imprimir datos básicos')",
        "a:has-text('Imprimir Datos Básicos')",
        "a:has-text('Imprimir datos basicos')",
        "input[value*='Imprimir datos básicos' i]",
        "input[value*='Imprimir datos basicos' i]",
        "input[value*='Imprimir Datos' i]",
        "button:has-text('Imprimir Certificado')",
        "a:has-text('Imprimir Certificado')",
        "button:has-text('Certificado de Afiliación')",
        "a:has-text('Certificado de Afiliación')",
        "button:has-text('Imprimir')",
        "a:has-text('Imprimir')",
        "input[value*='Imprimir' i]",
      ].join(', '),
    )
    .first();

  const visible = await btn.isVisible({ timeout: 8000 }).catch(() => false);
  if (!visible) {
    return {
      kind: 'ERROR',
      mensaje: 'No se encontró botón "Imprimir datos básicos" — verificar selectores',
    };
  }

  log.info('click Imprimir datos básicos');
  let pdfBuffer: Buffer | null = null;
  const ctx = page.context();
  const onResponse = async (response: Response): Promise<void> => {
    if (pdfBuffer) return;
    const ct = (response.headers()['content-type'] ?? '').toLowerCase();
    const respUrl = response.url();
    const ctEsPdf = ct.includes('application/pdf') || ct.includes('/pdf');
    const urlEsPdf = respUrl.toLowerCase().endsWith('.pdf');
    if (!ctEsPdf && !urlEsPdf) return;
    try {
      const buf = await response.body();
      if (buf.length > 100 && buf.subarray(0, 4).toString('ascii') === '%PDF') {
        pdfBuffer = buf;
        log.info({ url: respUrl, size: buf.length }, 'PDF certificado capturado');
      } else {
        log.warn(
          { url: respUrl, size: buf.length, head: buf.subarray(0, 8).toString('hex') },
          'response con CT pdf pero firma %PDF- ausente — descartado',
        );
      }
    } catch (err) {
      log.warn(
        { url: respUrl, err: err instanceof Error ? err.message : err },
        'response.body() falló',
      );
    }
  };
  ctx.on('response', onResponse);

  const downloadPromise = page.waitForEvent('download', { timeout: 18000 }).catch(() => null);

  try {
    await btn.click({ force: true });

    const start = Date.now();
    while (Date.now() - start < 20000) {
      if (pdfBuffer) break;
      await page.waitForTimeout(500);
    }

    if (pdfBuffer) return { kind: 'OK', pdf: pdfBuffer };

    log.info('Sin response PDF en network — esperando download tradicional');
    const download = await downloadPromise;
    if (download) {
      const tmpPath = await download.path();
      if (tmpPath) {
        const fs = await import('node:fs/promises');
        const buf = await fs.readFile(tmpPath);
        if (buf.length > 100 && buf.subarray(0, 4).toString('ascii') === '%PDF') {
          return { kind: 'OK', pdf: buf };
        }
        log.warn({ size: buf.length }, 'download capturado pero firma %PDF- ausente');
      }
    }

    return {
      kind: 'ERROR',
      mensaje: 'Click ejecutado pero no se capturó PDF (timeout 20s)',
    };
  } finally {
    ctx.off('response', onResponse);
  }
}

/**
 * Mapeo del código AXA al label visible en el select de tipo de
 * documento. Cubre el catálogo completo aunque la pantalla de
 * Consulta solo expone los más comunes (Cédula y NIT).
 */
const LABEL_POR_CODIGO_AXA: Record<string, string> = {
  '1': 'Cédula',
  '2': 'NIT',
  '3': 'Tarjeta Identidad',
  '4': 'Cédula Extranjería',
  '5': 'Pasaporte',
  '6': 'Carné Diplomatico',
  '7': 'Salvo Conducto Permanencia',
  '8': 'Permiso Especial de Permanencia',
  '9': 'Permiso Protección Temporal',
};

/**
 * Selecciona el tipo de documento en el select del form de Consulta.
 * Estrategia: intentar primero por value (código AXA — funciona en el
 * Ingreso Individual y en formularios consistentes). Si la opción no
 * existe con ese value, caer a selección por label visible.
 *
 * En la pantalla de Consulta el catálogo es reducido (Cédula + NIT)
 * y el `value` puede no coincidir con los códigos del Ingreso.
 */
async function seleccionarTipoDoc(
  page: Page,
  selectLocator: Locator,
  codigoAxa: string,
): Promise<void> {
  try {
    await selectLocator.selectOption(codigoAxa, { force: true });
    return;
  } catch {
    // Continuar con fallback por label
  }
  const label = LABEL_POR_CODIGO_AXA[codigoAxa];
  if (!label) {
    throw new Error(`Tipo doc AXA "${codigoAxa}" no tiene mapeo a label conocido`);
  }
  try {
    await selectLocator.selectOption({ label }, { force: true });
    return;
  } catch (err) {
    // Última estrategia: matching por texto inicial — el portal puede
    // mostrar "Cédula de Ciudadanía" en lugar de "Cédula" pelado.
    const ok = await page.evaluate(
      ({ id, prefix }) => {
        const el = document.getElementById(id) as HTMLSelectElement | null;
        if (!el) return false;
        for (const opt of Array.from(el.options)) {
          if (opt.text.trim().toUpperCase().startsWith(prefix.toUpperCase())) {
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      },
      { id: 'tipoDocumendo', prefix: label },
    );
    if (!ok) {
      throw new Error(
        `No se pudo seleccionar tipo doc "${label}" (${codigoAxa}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

/**
 * Navega por el menú lateral del portal AXA. Hace click nivel por
 * nivel hasta llegar a "Opción individual". Selectores tolerantes
 * por texto visible — el primer match de cada nivel gana.
 *
 * Si un nivel no se encuentra, retorna ERROR con info del nivel
 * que falló (útil para diagnosticar cambios del portal).
 */
async function navegarPorMenu(
  page: Page,
): Promise<{ kind: 'OK' } | { kind: 'ERROR'; mensaje: string }> {
  for (let i = 0; i < RUTAS_MENU.length; i++) {
    const opciones = RUTAS_MENU[i]!;
    log.info({ nivel: i + 1, opciones }, 'click menú');

    // Buscar cualquiera de las opciones del nivel — primer match gana.
    const selector = opciones
      .map(
        (txt) =>
          // Coincidencia por texto exacto del link/botón. AXA suele usar
          // <a> en menú lateral pero también puede ser <span>/<li>.
          `a:has-text("${txt}"), button:has-text("${txt}"), li:has-text("${txt}") > a, span:has-text("${txt}")`,
      )
      .join(', ');

    const item = page.locator(selector).first();
    const visible = await item.isVisible({ timeout: 6000 }).catch(() => false);
    if (!visible) {
      return {
        kind: 'ERROR',
        mensaje: `Menú nivel ${i + 1}: no se encontró ninguno de ${JSON.stringify(opciones)}`,
      };
    }

    try {
      await item.click({ force: true });
    } catch (err) {
      return {
        kind: 'ERROR',
        mensaje: `Menú nivel ${i + 1}: click falló — ${err instanceof Error ? err.message : err}`,
      };
    }

    await esperarSinOverlay(page).catch(() => {});
    await page.waitForTimeout(800);
  }
  // Tras el último click, esperamos que la URL/contenido cambie a la
  // pantalla de Consulta. El form se valida en el caller.
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  return { kind: 'OK' };
}
