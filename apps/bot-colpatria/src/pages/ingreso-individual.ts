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

  // Tras el submit, formIngreso aparece. Leemos ID_OPERACION.
  const idOperacion = await page
    .locator('#ID_OPERACION')
    .first()
    .inputValue()
    .catch(() => null);

  if (idOperacion == null) {
    // Tampoco apareció el form — puede ser un error visible en pantalla.
    const errorText = await extraerMensajeError(page);
    return {
      kind: 'ERROR',
      mensaje: errorText ?? 'No se renderea formIngreso tras BUSCAR (¿bloqueado por validación?)',
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
 * **EPS/AFP**: el payload de PILA actualmente NO incluye estos códigos
 * (solo IDs internos). En Sprint 8.4 quedan como TODO — si el caller
 * pasa `epsCodigoAxa` y `afpCodigoAxa`, se usan; si no, se deja el
 * default del select y AXA mostrará error de validación. Sprint 8.5+
 * debe extender el payload del disparo con los códigos AXA.
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

  // EPS / AFP — ver TODO en JSDoc. Si vienen codes, los aplicamos.
  if (opciones.epsCodigoAxa) {
    await selectByValue(page, '#EpsAfiliado', opciones.epsCodigoAxa);
  } else {
    warnings.push('EPS no configurada — el portal va a fallar la validación');
  }
  if (opciones.afpCodigoAxa) {
    await selectByValue(page, '#AfpAfiliado', opciones.afpCodigoAxa);
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

  const urlFinal = page.url();
  const mensaje = await extraerMensajeError(page);
  // Heurística de éxito:
  //   - Si la URL cambió a algo distinto a IngresoIndividual → probable éxito
  //   - Si quedamos en IngresoIndividual y hay mensaje de error → falló
  //   - Si quedamos en IngresoIndividual y NO hay mensaje → ambiguo,
  //     marcamos OK pero el caller debería verificar contra BD/portal
  const enIngreso = urlFinal.includes('IngresoIndividual');
  const ok = !enIngreso || (mensaje !== null && /exitoso|registrad|guardad/i.test(mensaje));

  return { ok, urlFinal, mensaje, warnings };
}

// ============================================================================
// Helper: extraer mensaje de error/éxito visible en pantalla
// ============================================================================

async function extraerMensajeError(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const candidatos = [
      '.alert-danger',
      '.alert-warning',
      '.alert-success',
      '[class*="validation-summary-errors"]',
      '#mensaje',
      '#msj',
    ];
    for (const sel of candidatos) {
      const el = document.querySelector(sel) as HTMLElement | null;
      const txt = el?.textContent?.trim();
      if (txt && txt.length > 0) return txt.slice(0, 500);
    }
    return null;
  });
}
