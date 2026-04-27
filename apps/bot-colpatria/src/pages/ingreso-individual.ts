import type { Page } from 'playwright';
import { esperarSinOverlay, esperarSelectPoblado } from '../lib/browser.js';
import { createLogger } from '../lib/logger.js';
import type { CamposIngreso } from '../lib/payload-form.js';

const log = createLogger('ingreso');

const URL_INGRESO_INDIVIDUAL =
  'https://portalarl.axacolpatria.co/PortalARL/EmpleadoDependiente/IngresoIndividual';

/**
 * Resultado de `verificarEmpleado` — refleja qué pasa tras el BUSCAR.
 */
export type ResultadoVerificacion =
  | { kind: 'NUEVO' } // ID_OPERACION = 0 → formIngreso para creación
  | { kind: 'EXISTE'; idOperacion: string } // empleado ya registrado
  | { kind: 'ERROR'; mensaje: string };

/**
 * Resultado de `llenarYCrearEmpleado` — útil para que el caller decida
 * cómo marcar el job (SUCCESS / FAILED / RETRYABLE) y qué loguear.
 */
export type ResultadoCreacion = {
  ok: boolean;
  /** URL en la que quedamos tras el submit. */
  urlFinal: string;
  /** Mensaje extraído del portal (alerta de error o confirmación). */
  mensaje: string | null;
  /** Warnings acumulados durante el llenado (truncados, fallbacks, etc). */
  warnings: string[];
  /** Sprint 8.5.B — PDF del comprobante de afiliación si AXA lo
   *  ofreció tras el submit. Null si no aparece el botón "Imprimir"
   *  o falla la captura del download. El caller lo persiste con
   *  `guardarPdfComprobante` (no lo escribe esta función para
   *  mantener el wrapper sin side effects de filesystem). */
  pdfBuffer: Buffer | null;
};

// ============================================================================
// Helpers comunes
// ============================================================================

/**
 * Llena un input tipo date que el portal AXA renderea con datepicker
 * jQuery. El truco: escribir el valor + disparar `change` para que el
 * binding del jQuery se actualice. Sin el `change`, el form ignora lo
 * tipeado.
 */
async function fillFecha(page: Page, selector: string, ddmmyyyy: string): Promise<void> {
  await page.fill(selector, ddmmyyyy);
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLInputElement | null;
    if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector);
}

/**
 * Selecciona una opción de un `<select>` que AXA esconde con
 * Bootstrap-select. Usa `force: true` porque el select nativo está
 * con `display:none`. Si la opción no existe, tira un error claro.
 */
async function selectByValue(page: Page, selector: string, value: string): Promise<void> {
  await page.selectOption(selector, value, { force: true });
}

/**
 * Selecciona por label (texto visible) en lugar de value. Útil para
 * Departamento/Ciudad que se reciben con nombre PILA (DIVIPOLA), no
 * con código.
 *
 * AXA antepone el código numérico al nombre con guión:
 *   PILA: "Valle Del Cauca"
 *   AXA:  "76-VALLE"
 *
 * Estrategia de match con prioridad:
 *   1. **Exacto**: igual normalizado (con o sin código antes del guión)
 *   2. **Primera palabra**: la primera palabra del target coincide con
 *      la primera del option stripped (ej. "BOGOTA DC" vs "BOGOTA D C",
 *      o "VALLE DEL CAUCA" vs "VALLE")
 *   3. **Substring**: el "stripped" del option está contenido en target
 *      o viceversa — solo como último recurso porque puede haber
 *      colisiones (ej. "CAUCA" ∈ "VALLE DEL CAUCA" y existe "19-CAUCA")
 *
 * Normalización aplicada a ambos lados:
 *   - NFD + remove diacritics (tildes)
 *   - UPPERCASE
 *   - Remove dots (BOGOTÁ D.C. → BOGOTA D C)
 *   - Collapse multiple spaces
 *
 * **Importante**: el código dentro de `page.evaluate` no puede declarar
 * funciones nombradas (como `const norm = (s) => ...`) porque `tsx` con
 * `keepNames` inyecta una llamada `__name()` que no existe en el browser.
 * Por eso la normalización va inline cada vez (verboso pero seguro).
 */
async function selectByLabel(page: Page, selector: string, label: string): Promise<void> {
  const matched = await page.evaluate(
    ({ sel, lab }) => {
      const el = document.querySelector(sel) as HTMLSelectElement | null;
      if (!el) return null;

      // Normalizar el target (PILA) — inline.
      // El regex ̀-ͯ cubre los combining diacritical marks
      // (las tildes que NFD descompone en marca + letra base).
      const normTarget = lab
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const targetFirst = normTarget.split(' ')[0] ?? '';

      let exactMatch: { value: string; text: string } | null = null;
      let substringMatch: { value: string; text: string } | null = null;
      let firstWordMatch: { value: string; text: string } | null = null;

      for (const opt of Array.from(el.options)) {
        // Normalizar option (AXA) — mismo pipeline, inline
        const optNorm = opt.text
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toUpperCase()
          .replace(/\./g, '')
          .replace(/\s+/g, ' ')
          .trim();
        // Quitar prefijo "<num>-" (formato AXA)
        const dashIdx = optNorm.indexOf('-');
        const optStripped = dashIdx >= 0 ? optNorm.slice(dashIdx + 1).trim() : optNorm;
        const optFirst = optStripped.split(' ')[0] ?? '';

        // Prioridad 1: exact match (con o sin código)
        if (optNorm === normTarget || optStripped === normTarget) {
          exactMatch = { value: opt.value, text: opt.text };
          break;
        }
        // Prioridad 2: substring containment (cualquier dirección)
        if (
          !substringMatch &&
          optStripped !== '' &&
          (normTarget.includes(optStripped) || optStripped.includes(normTarget))
        ) {
          substringMatch = { value: opt.value, text: opt.text };
        }
        // Prioridad 3: primera palabra coincide
        if (!firstWordMatch && optFirst !== '' && optFirst === targetFirst) {
          firstWordMatch = { value: opt.value, text: opt.text };
        }
      }

      if (exactMatch) return exactMatch;
      if (firstWordMatch) return firstWordMatch;
      if (substringMatch) return substringMatch;

      return {
        value: null,
        opciones: Array.from(el.options).map((o) => o.text),
      };
    },
    { sel: selector, lab: label },
  );
  if (!matched || matched.value == null) {
    const opciones = (matched as { opciones?: string[] } | null)?.opciones ?? [];
    throw new Error(
      `Sin match para "${label}" en ${selector}. Opciones: ${opciones.slice(0, 10).join(', ')}…`,
    );
  }
  await selectByValue(page, selector, matched.value as string);
}

// ============================================================================
// Paso 1: BUSCAR (form de Verificar)
// ============================================================================

/**
 * Navega a `/EmpleadoDependiente/IngresoIndividual` y ejecuta el form
 * de consulta para verificar si el empleado ya existe.
 *
 * Tras el BUSCAR, el portal renderea `formIngreso` en la misma página
 * con el campo oculto `ID_OPERACION`:
 *   - "0"     → nuevo empleado (CREAR)
 *   - "<num>" → empleado ya existe (UPDATE/MODIFICAR — caso REACTIVAR)
 *
 * El bot **solo soporta CREAR** en Sprint 8.4. Si detecta que el
 * empleado ya existe, devuelve `EXISTE` y el caller decide.
 */
export async function verificarEmpleado(
  page: Page,
  consulta: { tipoIdentificacion: string; documento: string },
): Promise<ResultadoVerificacion> {
  log.info({ consulta }, 'navegando a IngresoIndividual');
  await page.goto(URL_INGRESO_INDIVIDUAL, { waitUntil: 'networkidle' });

  // Si la sesión expiró silenciosamente, AXA redirige a login.
  if (page.url().includes('/Autenticacion/')) {
    return { kind: 'ERROR', mensaje: 'Sesión expiró antes del BUSCAR' };
  }

  // formConsulta: TipoIdentificacionSelect + txtNumeroDocumento + BUSCAR
  await selectByValue(page, '#TipoIdentificacionSelect', consulta.tipoIdentificacion);
  await page.fill('#txtNumeroDocumento', consulta.documento);

  log.info('click BUSCAR');
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page
      .locator(
        "button:has-text('BUSCAR'), button:has-text('Buscar'), input[type='submit'][value='BUSCAR']",
      )
      .first()
      .click({ force: true }),
  ]);
  await esperarSinOverlay(page);
  // Margen para que modales animados aparezcan (CSS transitions)
  await page.waitForTimeout(1500);

  // Detección PRIORITARIA: modal/banner con "Ya existe un empleado".
  // AXA no rellena ID_OPERACION cuando ya existe — bloquea con modal.
  const mensajeBloqueante = await extraerMensajeError(page);
  if (mensajeBloqueante && /ya existe/i.test(mensajeBloqueante)) {
    // Cerrar el modal para dejar el browser limpio
    await cerrarModalAceptar(page).catch(() => {});
    return {
      kind: 'EXISTE',
      idOperacion: '?', // AXA no expuso el id, pero es seguro que existe
    };
  }

  // Si no hay modal de "ya existe", esperamos a que el form renderee.
  // El input #txtPrimerNombre tiene `class="form-control animated"` —
  // AXA usa animaciones CSS que pueden tardar después del BUSCAR.
  // Esperamos a que sea visible antes de continuar.
  const formListo = await page
    .locator('#txtPrimerNombre')
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  if (!formListo) {
    // El form no se renderea — error genérico
    const errorText = await extraerMensajeError(page);
    return {
      kind: 'ERROR',
      mensaje:
        errorText ?? 'formIngreso no se hizo visible tras BUSCAR (¿bloqueado por validación?)',
    };
  }

  // Form visible — leemos ID_OPERACION para distinguir CREAR vs MODIFICAR
  const idOperacion = await page
    .locator('#ID_OPERACION')
    .first()
    .inputValue()
    .catch(() => null);

  if (idOperacion == null) {
    return {
      kind: 'ERROR',
      mensaje: 'Form visible pero ID_OPERACION ausente — formato del portal cambió',
    };
  }

  if (idOperacion === '0' || idOperacion === '') {
    return { kind: 'NUEVO' };
  }
  return { kind: 'EXISTE', idOperacion };
}

// ============================================================================
// Paso 2: Llenar formIngreso y crear
// ============================================================================

/**
 * Llena el formulario completo de Ingreso Individual y hace submit.
 *
 * Asume que `verificarEmpleado` retornó `NUEVO` y que estamos en la
 * página con `formIngreso` renderizado.
 *
 * **EPS/AFP** (Sprint 8.5): se toman de `campos.laborales.epsCodigoAxa`
 * y `campos.laborales.afpCodigoAxa`, que vienen del payload del job
 * (resolución de `EntidadSgss.codigoAxa` configurado por el ADMIN en
 * `/admin/catalogos/entidades`). Si están null, el bot continúa con
 * el select sin tocar y el portal va a fallar la validación → job
 * RETRYABLE con mensaje claro.
 *
 * El parámetro `opciones` permite override manual (útil para
 * `test-ingreso --eps-codigo-axa <c>`).
 */
export async function llenarYCrearEmpleado(
  page: Page,
  campos: CamposIngreso,
  opciones: { epsCodigoAxa?: string; afpCodigoAxa?: string } = {},
): Promise<ResultadoCreacion> {
  const warnings = [...campos.warnings];

  log.info('llenando datos personales');
  await page.fill('#txtPrimerNombre', campos.personales.primerNombre);
  await page.fill('#txtSegundoNombre', campos.personales.segundoNombre);
  await page.fill('#txtPrimerApellido', campos.personales.primerApellido);
  await page.fill('#txtSegundoApellido', campos.personales.segundoApellido);
  await fillFecha(page, '#dtpFechaNacimiento', campos.personales.fechaNacimiento);
  await selectByValue(page, '#GeneroSelect', campos.personales.genero);
  if (campos.personales.estadoCivil) {
    await selectByValue(page, '#estadoCivilSelect', campos.personales.estadoCivil);
  }

  log.info('llenando domicilio + contacto');
  if (campos.domicilio.departamentoNombre) {
    await selectByLabel(page, '#DepartamentoSelect', campos.domicilio.departamentoNombre);
    await esperarSinOverlay(page);
    await esperarSelectPoblado(page, '#CiudadSelect', 1);
    if (campos.domicilio.ciudadNombre) {
      await selectByLabel(page, '#CiudadSelect', campos.domicilio.ciudadNombre);
    }
  }
  // ⚠ El input tiene id `txtDireccionDomicilio` pero el name es
  // `DireccionDocmicilio` (typo de AXA, preservado en su HTML). Usamos
  // el id que es estable.
  await page.fill('#txtDireccionDomicilio', campos.domicilio.direccion);
  await page.fill('#txtTelefono', campos.domicilio.telefono);
  await page.fill('#txtCelular', campos.domicilio.celular);
  await page.fill('#txtEmail', campos.domicilio.email);

  log.info('llenando datos laborales');
  await fillFecha(page, '#dtpFechaIngreso', campos.laborales.fechaIngreso);
  await selectByValue(page, '#tipoSalarioSelect', campos.laborales.tipoSalario);
  // ⚠ El input del salario tiene id `Salaraio` (typo AXA), name `ValorSalario`.
  await page.fill('#Salaraio', campos.laborales.valorSalario);
  await page.fill('#txtCargo', campos.laborales.cargo);

  // Cascada Empresa → Sucursal → CentroTrabajo → ActividadEconomica (autollenado).
  // Si la cuenta solo tiene una empresa misión (caso típico, value="0"),
  // selectOption por value funciona. Si tu cuenta es outsourcing puro
  // con varias empresas, ajustar para usar selectByLabel.
  await selectByValue(page, '#EmpresasSelect', campos.laborales.nitEmpresaMision).catch(
    async () => {
      // fallback: la cuenta solo tiene "0-EMPLEADOS DE PLANTA" como única opción
      await selectByValue(page, '#EmpresasSelect', '0');
    },
  );
  await esperarSinOverlay(page);

  await selectByValue(page, '#SucursalSelect', campos.laborales.codigoSucursal);
  await esperarSinOverlay(page);

  if (!campos.laborales.codigoCentroTrabajo) {
    throw new Error(
      'Centro de trabajo no resuelto — revisar config de empresa (default sucursal o mapeo nivel→centro)',
    );
  }
  await selectByValue(page, '#CentroTrabajoSelect', campos.laborales.codigoCentroTrabajo);
  await esperarSinOverlay(page);

  // EPS / AFP — Sprint 8.5: prioridad `opciones` (override CLI) sobre
  // `campos.laborales` (payload del job). Si ambos son null/undefined,
  // dejamos el select sin tocar y el portal va a marcar required.
  const epsCodigo = opciones.epsCodigoAxa ?? campos.laborales.epsCodigoAxa ?? null;
  const afpCodigo = opciones.afpCodigoAxa ?? campos.laborales.afpCodigoAxa ?? null;

  if (epsCodigo) {
    await selectByValue(page, '#EpsAfiliado', epsCodigo);
  } else {
    warnings.push('EPS no configurada — el portal va a fallar la validación');
  }
  if (afpCodigo) {
    await selectByValue(page, '#AfpAfiliado', afpCodigo);
  } else {
    warnings.push('AFP no configurada — el portal va a fallar la validación');
  }

  await selectByValue(page, '#tipoAfiliacionEmpresasSelect', campos.laborales.tipoAfiliacion);

  // Cascada Grupo → Tipo Ocupación
  await selectByValue(page, '#tipoGrupoOcupacionSelect', campos.laborales.grupoOcupacion);
  await esperarSinOverlay(page);
  await esperarSelectPoblado(page, '#tipoOcupacionEmpresasSelect', 1);
  await selectByValue(page, '#tipoOcupacionEmpresasSelect', campos.laborales.tipoOcupacion);

  await selectByValue(page, '#modalidadTrabajoSelect', campos.laborales.modalidadTrabajo);
  await selectByValue(page, '#altoRiesgoSelect', campos.laborales.tareaAltoRiesgo);

  log.info('marcando jornada');
  if (campos.jornada.completa) {
    await page.check('#rbJornadaIngIndivDependSi');
  } else {
    await page.check('#rbJornadaIngIndivDependNo');
    // Si en el futuro permitimos jornada parcial, hay que hacer click
    // en "Agregar horario" y completar el modal. Por ahora bloqueamos.
    throw new Error('Jornada parcial no implementada — el bot solo procesa "completa=Sí"');
  }

  log.info('submit Ingresar Empleado');
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 60000 }),
    page
      .locator(
        "#btnModificar, button:has-text('Ingresar Empleado'), input[value='Ingresar Empleado']",
      )
      .first()
      .click({ force: true }),
  ]);

  // Tras el submit, AXA puede:
  //   a) Redirigir a otra URL (éxito típico)
  //   b) Mostrar un modal de validación con animación CSS (lento)
  //   c) Mostrar un overlay "Cargando..." mientras procesa
  // Esperamos:
  //   1. Que el overlay "Cargando" desaparezca
  //   2. Un poco de margen extra para animaciones de modal
  await esperarSinOverlay(page, 30000).catch(() => {
    /* si el overlay nunca aparece, OK */
  });
  await page.waitForTimeout(1500);

  // Capturar mensaje primero (incluye modales informativos), DESPUÉS
  // cerrar el modal con ACEPTAR si había uno.
  const urlFinal = page.url();
  const mensaje = await extraerMensajeError(page);

  await cerrarModalAceptar(page).catch(() => {
    /* no-op si no hay modal */
  });

  // Heurística de éxito:
  //   - Si la URL cambió a algo distinto a IngresoIndividual → probable éxito
  //   - Si quedamos en IngresoIndividual y hay mensaje de éxito → OK
  //   - Si quedamos en IngresoIndividual y NO hay mensaje → ambiguo,
  //     marcamos NO OK por seguridad
  // El portal AXA usa textos como:
  //   · "Transaccion Exitosa"
  //   · "Empleado registrado..." / "Registro exitoso"
  //   · "Datos guardados"
  // Cubrimos ambos géneros (exitoso/exitosa) y el verbo conjugado.
  const enIngreso = urlFinal.includes('IngresoIndividual');
  const ok =
    !enIngreso ||
    (mensaje !== null && /exitos[ao]|registrad|guardad|transacci[oó]n.*exit/i.test(mensaje));

  // Si el submit salió OK, intentamos descargar el comprobante PDF.
  // No bloqueante: si el botón no aparece o el download falla,
  // dejamos un warning y devolvemos null. El caller decide si marca
  // el job como SUCCESS sin PDF o RETRYABLE para reintento.
  let pdfBuffer: Buffer | null = null;
  if (ok) {
    try {
      pdfBuffer = await descargarComprobante(page);
      if (!pdfBuffer) {
        warnings.push('Submit OK pero no se encontró botón Imprimir comprobante');
      }
    } catch (err) {
      warnings.push(`Falló descarga del PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ok, urlFinal, mensaje, warnings, pdfBuffer };
}

// ============================================================================
// Paso 3: Descarga del comprobante PDF (Sprint 8.5.B)
// ============================================================================

/**
 * Tras un submit exitoso, AXA muestra un botón para imprimir/descargar
 * el comprobante de afiliación. El form se llama `formImpresion` y
 * apunta a `/EmpleadoDependiente/ImprimirCreacionIndividual`.
 *
 * Hay 2 patrones que el portal puede usar:
 *   a) Click en botón → Playwright `download` event → buffer directo
 *   b) Click → abre PDF en pestaña nueva (popup) → leemos el contenido
 *
 * Probamos ambos via `Promise.race`. Si ninguno dispara en 15s,
 * retornamos null (no es bloqueante).
 *
 * Selectores tolerantes — buscamos por texto visible para sobrevivir
 * cambios de id/class del portal.
 */
async function descargarComprobante(page: Page): Promise<Buffer | null> {
  log.info('buscando botón de comprobante PDF');

  // Intenta encontrar el botón. Lista en orden de probabilidad.
  const btn = page
    .locator(
      [
        // Por texto típico
        "button:has-text('Imprimir')",
        "a:has-text('Imprimir')",
        "input[value*='Imprimir' i]",
        "button:has-text('Comprobante')",
        "a:has-text('Comprobante')",
        "button:has-text('Descargar')",
        "a:has-text('Descargar')",
        // Por form/action
        "form[action*='ImprimirCreacionIndividual'] button",
        "form[action*='ImprimirCreacionIndividual'] input[type='submit']",
        // Fallback IDs comunes
        '#btnImprimir',
        '#btnImprimirComprobante',
      ].join(', '),
    )
    .first();

  const visible = await btn.isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) {
    log.warn('No se encontró botón de comprobante visible');
    return null;
  }

  log.info('click botón comprobante');

  // Capturar download O popup, lo que llegue primero
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  const popupPromise = page
    .context()
    .waitForEvent('page', { timeout: 20000 })
    .catch(() => null);

  await btn.click({ force: true });

  const [download, popup] = await Promise.all([downloadPromise, popupPromise]);

  // Caso (a): download tradicional
  if (download) {
    log.info({ filename: download.suggestedFilename() }, 'download capturado');
    const tmpPath = await download.path();
    if (!tmpPath) {
      log.warn('download.path() retornó null — descarga falló');
      return null;
    }
    const fs = await import('node:fs/promises');
    const buf = await fs.readFile(tmpPath);
    return buf.length > 0 ? buf : null;
  }

  // Caso (b): popup con PDF inline
  if (popup) {
    log.info({ url: popup.url() }, 'popup capturado');
    await popup.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Intentar leer el PDF como response del popup. El URL del popup
    // puede ser el endpoint `/ImprimirCreacionIndividual` directamente.
    const popupUrl = popup.url();
    if (popupUrl && (popupUrl.includes('Imprimir') || popupUrl.endsWith('.pdf'))) {
      // Hacemos un fetch en el contexto del popup para obtener el binario
      const buf = await popup
        .evaluate(async (url) => {
          const res = await fetch(url, { credentials: 'include' });
          if (!res.ok) return null;
          const ab = await res.arrayBuffer();
          return Array.from(new Uint8Array(ab));
        }, popupUrl)
        .then((arr) => (arr ? Buffer.from(arr) : null))
        .catch(() => null);

      await popup.close().catch(() => {});
      return buf && buf.length > 0 ? buf : null;
    }

    await popup.close().catch(() => {});
    return null;
  }

  log.warn('Ni download ni popup tras click en botón comprobante');
  return null;
}

// ============================================================================
// Helper: extraer mensaje de error/éxito visible en pantalla
// ============================================================================

/**
 * Lee el texto visible más relevante de la página tras un submit. Cubre:
 *   - Alertas Bootstrap (.alert-danger / -warning / -success)
 *   - Validation-summary de ASP.NET MVC
 *   - Modales informativos del portal AXA (`.modal.show`, `[role=dialog]`)
 *
 * Si AXA muestra un modal con texto "La fecha de ingreso debe ser a
 * partir de…", esto lo captura para que el caller pueda persistirlo
 * en el job.error con info útil.
 */
async function extraerMensajeError(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const candidatos = [
      // Alertas inline (Bootstrap)
      '.alert-danger',
      '.alert-warning',
      '.alert-success',
      '[class*="validation-summary-errors"]',
      '#mensaje',
      '#msj',
      // Modales AXA (Bootstrap modal abierto)
      '.modal.show .modal-body',
      '.modal.in .modal-body',
      '[role="dialog"][aria-hidden="false"] .modal-body',
      // Toasts / notifications
      '.toast-message',
      '.notification',
    ];
    for (const sel of candidatos) {
      const el = document.querySelector(sel) as HTMLElement | null;
      const txt = el?.textContent?.trim();
      if (txt && txt.length > 0) return txt.slice(0, 500);
    }
    return null;
  });
}

/**
 * Si hay un modal abierto con un botón "ACEPTAR" / "Aceptar", le da
 * click. No tira si no hay modal — silencioso por diseño.
 */
async function cerrarModalAceptar(page: Page): Promise<void> {
  const btn = page
    .locator(
      ".modal.show button:has-text('ACEPTAR'), .modal.show button:has-text('Aceptar'), .modal.in button:has-text('ACEPTAR'), .modal.in button:has-text('Aceptar')",
    )
    .first();
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btn.click({ force: true, timeout: 3000 }).catch(() => {});
  }
}
