import type { NivelRiesgo } from '@pila/db';

/**
 * Resolución de la config Colpatria que va a Ingreso Individual.
 *
 * Reglas de mapeo:
 *
 *   1. Centro de Trabajo: si la empresa configuró un mapeo nivel→centro
 *      (`EmpresaNivelRiesgo.colpatriaCentroTrabajo`) para el nivel del
 *      cotizante, ese gana. Si no, se usa
 *      `Empresa.colpatriaCodigoSucursalDefault` como fallback.
 *
 *   2. Nit Empresa Misión = NIT de la propia empresa (caso típico no
 *      outsourcing — confirmado por el operador).
 *
 *   3. Tarea Alto Riesgo: derivado del nivel:
 *        - Nivel V → "S"
 *        - Nivel I, II, III, IV → "N"
 *      Esta regla está en la normativa colombiana (Decreto 2090/2003).
 *
 *   4. Aplicación / Perfil → defaults de la empresa (ARP / OFI si
 *      están null).
 *
 * El objetivo es centralizar la conversión "afiliación PILA → campos
 * AXA" en una sola función pura, fácil de testear sin BD.
 */

export type EmpresaConfigSnapshot = {
  nit: string;
  colpatriaAplicacion: string | null;
  colpatriaPerfil: string | null;
  colpatriaEmpresaIdInterno: string | null;
  colpatriaAfiliacionId: string | null;
  colpatriaCodigoSucursalDefault: string | null;
  colpatriaTipoAfiliacionDefault: string | null;
  colpatriaGrupoOcupacionDefault: string | null;
  colpatriaTipoOcupacionDefault: string | null;
  colpatriaModalidadTrabajoDefault: string | null;
  /** Mapeo nivel → centro. La función pura recibe la lista; quien la
   *  llama hace el query a EmpresaNivelRiesgo. */
  nivelesCentros: Array<{ nivel: NivelRiesgo; codigoCentroTrabajo: string | null }>;
};

export type ConfigResuelta = {
  // Selectores /Bienvenida
  aplicacion: string;
  perfil: string;
  empresaIdInterno: string;
  afiliacionId: string;
  // Defaults form
  nitEmpresaMision: string;
  codigoSucursal: string;
  codigoCentroTrabajo: string | null;
  tipoAfiliacion: string;
  grupoOcupacion: string;
  tipoOcupacion: string;
  modalidadTrabajo: string;
  tareaAltoRiesgo: 'S' | 'N';
};

export type ErroresConfig = string[];

/**
 * Verifica que la empresa tenga toda la configuración mínima del bot
 * antes de que el worker lo intente. Devuelve lista de errores (vacía
 * si todo OK).
 *
 * Se usa al activar el bot en la UI Y en el worker antes de procesar
 * un job (defensa: si alguien cambió la config a medio job, no rompemos
 * con un error críptico de Playwright).
 */
export function validarConfigCompleta(snap: EmpresaConfigSnapshot): ErroresConfig {
  const errores: ErroresConfig = [];

  if (!snap.colpatriaAplicacion) errores.push('Falta Aplicación AXA (ej: ARP)');
  if (!snap.colpatriaPerfil) errores.push('Falta Perfil AXA (OFI u OPE)');
  if (!snap.colpatriaEmpresaIdInterno)
    errores.push('Falta ID interno de empresa AXA (option value de #ddlEmpresas)');
  if (!snap.colpatriaAfiliacionId)
    errores.push('Falta número de afiliación AXA (option value de #ddlAfiliaciones)');

  if (!snap.colpatriaCodigoSucursalDefault) errores.push('Falta código de Sucursal default');
  if (!snap.colpatriaTipoAfiliacionDefault) errores.push('Falta Tipo de Afiliación default');
  if (!snap.colpatriaGrupoOcupacionDefault) errores.push('Falta Grupo de Ocupación default');
  if (!snap.colpatriaTipoOcupacionDefault) errores.push('Falta Tipo de Ocupación default');
  if (!snap.colpatriaModalidadTrabajoDefault) errores.push('Falta Modalidad de Trabajo default');

  return errores;
}

/**
 * Compone los valores que el bot va a llenar en el form de Ingreso
 * Individual, dado:
 *   - La config de la empresa
 *   - El nivel de riesgo de la afiliación a procesar
 *
 * **Asume que `validarConfigCompleta` retornó vacío.** Si no, lanza.
 */
export function resolverConfigParaAfiliacion(
  snap: EmpresaConfigSnapshot,
  nivelAfiliacion: NivelRiesgo,
): ConfigResuelta {
  const errores = validarConfigCompleta(snap);
  if (errores.length > 0) {
    throw new Error(`Config incompleta: ${errores.join('; ')}`);
  }

  // Centro de trabajo: prioriza el mapeo por nivel; cae al default.
  const mapeo = snap.nivelesCentros.find((m) => m.nivel === nivelAfiliacion);
  const centro = mapeo?.codigoCentroTrabajo ?? snap.colpatriaCodigoSucursalDefault;

  // Tarea alto riesgo: solo nivel V por normativa.
  const tareaAltoRiesgo: 'S' | 'N' = nivelAfiliacion === 'V' ? 'S' : 'N';

  return {
    aplicacion: snap.colpatriaAplicacion!,
    perfil: snap.colpatriaPerfil!,
    empresaIdInterno: snap.colpatriaEmpresaIdInterno!,
    afiliacionId: snap.colpatriaAfiliacionId!,
    nitEmpresaMision: snap.nit, // confirmado: afiliante = misión
    codigoSucursal: snap.colpatriaCodigoSucursalDefault!,
    codigoCentroTrabajo: centro ?? null,
    tipoAfiliacion: snap.colpatriaTipoAfiliacionDefault!,
    grupoOcupacion: snap.colpatriaGrupoOcupacionDefault!,
    tipoOcupacion: snap.colpatriaTipoOcupacionDefault!,
    modalidadTrabajo: snap.colpatriaModalidadTrabajoDefault!,
    tareaAltoRiesgo,
  };
}
