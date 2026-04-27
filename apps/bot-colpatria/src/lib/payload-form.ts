/**
 * Función pura: convierte un `ColpatriaPayload` (tal como lo guarda
 * `apps/web/src/lib/colpatria/disparos.ts` en BD) + la `ConfigResuelta`
 * de la empresa, en los valores listos para llenar el form de Ingreso
 * Individual de AXA Colpatria.
 *
 * Toda la lógica de mapeo PILA → AXA vive aquí: tipos de documento,
 * formato de fecha, formato de salario, longitudes máximas, etc.
 *
 * **No tiene side effects** — recibe datos, devuelve datos. Los tests
 * unitarios (`payload-form.test.ts`) cubren todo el rango de mapeos
 * sin necesitar Playwright ni BD.
 *
 * Si AXA cambia un código del catálogo o una validación de longitud,
 * ajustar acá y los tests deberían capturar la regresión.
 */

// ============================================================================
// Tipos del payload — DEBEN matchear el shape de
// `apps/web/src/lib/colpatria/disparos.ts > ColpatriaPayload`
// ============================================================================

export type ColpatriaPayload = {
  schemaVersion: 1;
  evento: 'CREAR' | 'REACTIVAR';
  afiliacion: {
    id: string;
    estado: string;
    modalidad: string;
    nivelRiesgo: string;
    salario: string; // Decimal serializado como string
    fechaIngreso: string; // ISO YYYY-MM-DD
    cargo: string | null;
    /** Sprint 8.5 — códigos AXA Colpatria de la afiliación. Pueden
     *  venir null si la EPS/AFP no tiene mapeo configurado en
     *  /admin/catalogos/entidades. El bot va a fallar el submit si
     *  alguno es null (AXA marca esos campos como required). */
    epsCodigoAxa?: string | null;
    afpCodigoAxa?: string | null;
    cotizante: {
      id: string;
      tipoDocumento: string; // CC | CE | NIT | PAS | TI | RC | NIP
      numeroDocumento: string;
      primerNombre: string;
      segundoNombre: string | null;
      primerApellido: string;
      segundoApellido: string | null;
      fechaNacimiento: string | null; // ISO YYYY-MM-DD
      genero: string | null; // M | F | O
      estadoCivil: string | null; // 1..5 (códigos AXA)
      email: string | null;
      celular: string | null;
      // NOTE: el payload web actual NO trae `telefono` — solo celular.
      // Si en el futuro `disparos.ts` lo agrega, declararlo aquí.
      direccion: string | null;
      municipio: string | null; // nombre, no código DIVIPOLA
      departamento: string | null; // nombre, no código DIVIPOLA
    };
    empresa: {
      id: string;
      nit: string;
      nombre: string;
    };
  };
};

// Espejo de `apps/web/src/lib/colpatria/config-resolver.ts > ConfigResuelta`.
export type ConfigResuelta = {
  aplicacion: string;
  perfil: string;
  empresaIdInterno: string;
  afiliacionId: string;
  nitEmpresaMision: string;
  codigoSucursal: string;
  codigoCentroTrabajo: string | null;
  tipoAfiliacion: string;
  grupoOcupacion: string;
  tipoOcupacion: string;
  tipoSalario: string;
  modalidadTrabajo: string;
  tareaAltoRiesgo: string;
};

// ============================================================================
// Catálogos de mapeo PILA → AXA
// ============================================================================

/**
 * Tipo de documento PILA → código del select AXA (`slcTipoIdentificacion`).
 *
 * Catálogo AXA (orden alfabético del JSON schema):
 *   1=Cédula, 2=NIT, 3=Tarjeta Identidad, 4=Cédula Extranjería,
 *   5=Pasaporte, 6=Carné Diplomatico, 7=Salvo Conducto Permanencia,
 *   8=Permiso Especial de Permanencia, 9=Permiso Protección Temporal.
 *
 * RC (Registro Civil) y NIP (Número de Identificación Personal) NO
 * tienen equivalente directo — al pasar uno de esos, `mapearTipoDocumento`
 * tira para que el caller marque el job como FAILED con mensaje claro.
 */
const TIPO_DOC_PILA_TO_AXA: Record<string, string> = {
  CC: '1',
  NIT: '2',
  TI: '3',
  CE: '4',
  PAS: '5',
};

/**
 * Género PILA (M/F/O) → AXA (M/F). AXA no expone "Otro" ni "X" — si
 * llega 'O' o null, fallback a 'M' con flag de warning.
 */
const GENERO_FALLBACK = 'M';

// ============================================================================
// Output shape — campos listos para el form
// ============================================================================

export type CamposIngreso = {
  // formConsulta (paso 1: BUSCAR antes de creación)
  consulta: {
    tipoIdentificacion: string;
    documento: string;
  };
  // formIngreso > datosPersonales
  personales: {
    primerNombre: string;
    segundoNombre: string;
    primerApellido: string;
    segundoApellido: string;
    fechaNacimiento: string; // dd/MM/yyyy
    genero: string; // M | F
    estadoCivil: string | null; // 1..5 o null = no especificado
  };
  // formIngreso > domicilio
  domicilio: {
    direccion: string; // ⚠ name del input es "DireccionDocmicilio" (typo AXA)
    telefono: string;
    celular: string;
    email: string;
    /** Nombre del departamento — el bot lo usa para abrir el dropdown
     *  custom y elegir por texto, ya que no tenemos código DIVIPOLA. */
    departamentoNombre: string | null;
    /** Nombre del municipio — idem. */
    ciudadNombre: string | null;
  };
  // formIngreso > datosLaborales
  laborales: {
    fechaIngreso: string; // dd/MM/yyyy
    tipoSalario: string; // quemado "1"
    valorSalario: string; // entero sin decimales ni separadores
    cargo: string;
    nitEmpresaMision: string;
    codigoSucursal: string;
    /** Centro de trabajo: del config (resuelto por nivel de riesgo).
     *  Si null, el bot debería caer al default empresa antes de llegar
     *  acá — si llega null acá es un bug de configuración. */
    codigoCentroTrabajo: string | null;
    tipoAfiliacion: string;
    grupoOcupacion: string;
    tipoOcupacion: string;
    modalidadTrabajo: string; // quemado "01"
    tareaAltoRiesgo: string; // quemado "0000001"
    /** Sprint 8.5 — código AXA de EPS y AFP. Null si la entidad SGSS
     *  no tiene `codigoAxa` configurado — caller decide qué hacer
     *  (típicamente: continuar y dejar que el portal valide). */
    epsCodigoAxa: string | null;
    afpCodigoAxa: string | null;
  };
  // formIngreso > jornada
  jornada: {
    /** Default true = "Sí, jornada completa" → no requiere modal de
     *  Agregar Horario. AXA marca el radio correspondiente. */
    completa: boolean;
  };
  /** Avisos no fatales que el caller puede loguear. Ej: género 'O' →
   *  fallback a 'M'; nombre o apellido truncado. */
  warnings: string[];
};

// ============================================================================
// Helpers de formato
// ============================================================================

function isoADdMmYyyy(iso: string): string {
  // "2025-04-26" → "26/04/2025"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`Fecha ISO inválida: "${iso}"`);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Calcula la fecha de ingreso para el form AXA.
 *
 * **Regla del portal Colpatria** (constatada por modal del propio
 * portal): la fecha de ingreso debe ser entre **mañana** (today + 1)
 * y máximo 30 días después.
 *
 * Lógica derivada de esa regla + intención del operador:
 *   - Si `fechaPilaIso` NO se proporciona → mañana.
 *   - Si `fechaPilaIso` ≤ hoy → mañana (la fecha PILA ya pasó o es
 *     hoy mismo, AXA exige al menos mañana).
 *   - Si `fechaPilaIso` > hoy → PILA (cae en rango aceptado por AXA;
 *     respetamos la fecha real del contrato registrada en PILA).
 *
 * Si la fecha PILA es muy lejana al futuro (>30 días), AXA igual la
 * rechazaría — eso queda como un warning visible al operador en lugar
 * de bloquear acá. La regla "<= 30 días" la valida el portal.
 *
 * Acepta `now` opcional para testing determinista.
 */
export function calcularFechaIngresoAxa(now: Date = new Date(), fechaPilaIso?: string): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0); // normalizar a inicio del día

  const manana = new Date(today);
  manana.setDate(manana.getDate() + 1);

  const formatear = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  // Sin fecha PILA → default mañana
  if (!fechaPilaIso) return formatear(manana);

  // Parsear fecha PILA (formato ISO YYYY-MM-DD). Si malformada, fallback.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaPilaIso);
  if (!m) return formatear(manana);
  // Normalizamos a inicio del día (00:00 hora local) para que la
  // comparación con `today` sea purely por día calendario, no horas.
  const fechaPila = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  fechaPila.setHours(0, 0, 0, 0);

  // Si PILA es estrictamente posterior a hoy (≥ mañana) → respetamos PILA.
  if (fechaPila.getTime() > today.getTime()) {
    return formatear(fechaPila);
  }
  // Caso contrario (hoy o pasado) → mañana.
  return formatear(manana);
}

function formatearSalario(decimal: string): string {
  const n = Number(decimal);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Salario inválido: "${decimal}"`);
  }
  return Math.round(n).toString();
}

function truncar(
  s: string | null | undefined,
  max: number,
  warnings: string[],
  campo: string,
): string {
  if (!s) return '';
  if (s.length > max) {
    warnings.push(`${campo} truncado de ${s.length} a ${max} chars (límite AXA)`);
    return s.slice(0, max);
  }
  return s;
}

// ============================================================================
// Mapeo principal
// ============================================================================

export function mapearTipoDocumento(pila: string): string {
  const axa = TIPO_DOC_PILA_TO_AXA[pila];
  if (!axa) {
    throw new Error(
      `Tipo de documento PILA "${pila}" no tiene equivalente en el catálogo AXA Colpatria. ` +
        `Permitidos: ${Object.keys(TIPO_DOC_PILA_TO_AXA).join(', ')}.`,
    );
  }
  return axa;
}

export function mapearGenero(pila: string | null, warnings: string[]): string {
  if (pila === 'F' || pila === 'M') return pila;
  warnings.push(`Género "${pila ?? 'null'}" no mapea directo a AXA — usando "${GENERO_FALLBACK}"`);
  return GENERO_FALLBACK;
}

/**
 * Valida que el payload tenga lo mínimo para llenar el form. Si falta
 * algo crítico, retorna lista de errores. Si no hay errores, el caller
 * puede asumir que `prepararCamposIngreso` no va a tirar.
 */
export function validarPayloadParaIngreso(payload: ColpatriaPayload): string[] {
  const errores: string[] = [];
  const af = payload.afiliacion;
  const c = af.cotizante;

  if (!af.cargo || af.cargo.trim() === '') {
    errores.push('Cargo es requerido por AXA pero está vacío en la afiliación');
  }
  if (!c.celular) {
    errores.push('Falta celular (AXA exige al menos un teléfono de contacto)');
  }
  if (!c.email) {
    errores.push('Email es requerido por AXA pero está vacío');
  }
  if (!c.direccion) {
    errores.push('Dirección es requerida por AXA pero está vacía');
  }
  if (!c.fechaNacimiento) {
    errores.push('Fecha de nacimiento es requerida por AXA');
  }
  if (!c.genero) {
    errores.push('Género es requerido por AXA');
  }
  // RC/NIP no se mapean
  if (!(c.tipoDocumento in TIPO_DOC_PILA_TO_AXA)) {
    errores.push(
      `Tipo de documento "${c.tipoDocumento}" no es procesable por bot Colpatria ` +
        `(permitidos: ${Object.keys(TIPO_DOC_PILA_TO_AXA).join(', ')})`,
    );
  }

  return errores;
}

/**
 * Convierte payload + config en los valores listos para llenar el form.
 *
 * Asume `validarPayloadParaIngreso` retornó vacío. Si no, puede tirar
 * o rellenar campos vacíos (el portal AXA fallará el submit).
 */
export function prepararCamposIngreso(
  payload: ColpatriaPayload,
  config: ConfigResuelta,
): CamposIngreso {
  const warnings: string[] = [];
  const af = payload.afiliacion;
  const c = af.cotizante;

  // datos personales — AXA tiene maxLength=15 en cada nombre/apellido
  const personales = {
    primerNombre: truncar(c.primerNombre, 15, warnings, 'PrimerNombre'),
    segundoNombre: truncar(c.segundoNombre, 15, warnings, 'SegundoNombre'),
    primerApellido: truncar(c.primerApellido, 15, warnings, 'PrimerApellido'),
    segundoApellido: truncar(c.segundoApellido, 15, warnings, 'SegundoApellido'),
    fechaNacimiento: c.fechaNacimiento ? isoADdMmYyyy(c.fechaNacimiento) : '',
    genero: mapearGenero(c.genero, warnings),
    estadoCivil: c.estadoCivil ?? null,
  };

  // domicilio — Dirección maxLength=60, Teléfono/Celular maxLength=15, Email maxLength=60
  // El payload web sólo trae `celular`. Para AXA llenamos ambos campos
  // (Teléfono y Celular) con el mismo número — es lo correcto en Colombia
  // moderna donde la mayoría usa solo móvil.
  const domicilio = {
    direccion: truncar(c.direccion, 60, warnings, 'Dirección'),
    telefono: truncar(c.celular ?? '', 15, warnings, 'Teléfono'),
    celular: truncar(c.celular ?? '', 15, warnings, 'Celular'),
    email: truncar(c.email, 60, warnings, 'Email'),
    departamentoNombre: c.departamento ?? null,
    ciudadNombre: c.municipio ?? null,
  };

  // laborales — Cargo maxLength=30, Salario maxLength=11
  const epsCodigoAxa = af.epsCodigoAxa ?? null;
  const afpCodigoAxa = af.afpCodigoAxa ?? null;
  if (!epsCodigoAxa) {
    warnings.push('EPS sin código AXA configurado — el portal va a rechazar el submit');
  }
  if (!afpCodigoAxa) {
    warnings.push('AFP sin código AXA configurado — el portal va a rechazar el submit');
  }
  // Regla AXA: fecha de ingreso debe estar entre mañana y +30 días.
  //   - Si la fecha PILA es futura (> hoy), la respetamos
  //   - Si es <= hoy (pasado o presente), AXA no la acepta → usamos mañana
  // Si hubo ajuste (PILA ≤ hoy), avisamos para que el operador sepa.
  const fechaAxa = calcularFechaIngresoAxa(undefined, af.fechaIngreso);
  const fechaPilaDdMmYyyy = isoADdMmYyyy(af.fechaIngreso);
  if (fechaPilaDdMmYyyy !== fechaAxa) {
    warnings.push(
      `Fecha de ingreso PILA es ${fechaPilaDdMmYyyy}, ajustada a ${fechaAxa} por regla AXA (mín. mañana).`,
    );
  }
  const laborales = {
    fechaIngreso: fechaAxa,
    tipoSalario: config.tipoSalario,
    valorSalario: formatearSalario(af.salario),
    cargo: truncar(af.cargo ?? '', 30, warnings, 'Cargo'),
    nitEmpresaMision: config.nitEmpresaMision,
    codigoSucursal: config.codigoSucursal,
    codigoCentroTrabajo: config.codigoCentroTrabajo,
    tipoAfiliacion: config.tipoAfiliacion,
    grupoOcupacion: config.grupoOcupacion,
    tipoOcupacion: config.tipoOcupacion,
    modalidadTrabajo: config.modalidadTrabajo,
    tareaAltoRiesgo: config.tareaAltoRiesgo,
    epsCodigoAxa,
    afpCodigoAxa,
  };

  return {
    consulta: {
      tipoIdentificacion: mapearTipoDocumento(c.tipoDocumento),
      documento: c.numeroDocumento,
    },
    personales,
    domicilio,
    laborales,
    jornada: { completa: true }, // default razonable — evita modal Horario
    warnings,
  };
}
