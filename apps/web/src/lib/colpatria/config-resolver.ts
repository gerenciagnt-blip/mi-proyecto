import type { NivelRiesgo } from '@pila/db';

/**
 * Resolución de la config Colpatria que va a Ingreso Individual.
 *
 * Reglas de mapeo:
 *
 *   1. Por-nivel: Centro de Trabajo, Grupo y Tipo de Ocupación se
 *      resuelven primero contra el mapeo nivel→valor en
 *      `EmpresaNivelRiesgo`. Si la fila del nivel tiene el campo en null,
 *      cae al default de empresa (`colpatria*Default`).
 *
 *   2. Nit Empresa Misión = NIT de la propia empresa (caso típico no
 *      outsourcing — confirmado por el operador).
 *
 *   3. Aplicación / Perfil → defaults de la empresa (ARP / OFI si
 *      están null).
 *
 *   4. **Valores quemados** (decididos con el operador, no se
 *      configuran por empresa ni por afiliación):
 *        - TipoSalario       = "1"        (Básico)
 *        - ModalidadTrabajo  = "01"       (Presencial)
 *        - TareaAltoRiesgo   = "0000001"  (No aplica)
 *
 * El objetivo es centralizar la conversión "afiliación PILA → campos
 * AXA" en una sola función pura, fácil de testear sin BD.
 */

/** Valores hardcoded — no salen de empresa ni afiliación. */
export const COLPATRIA_HARDCODED = {
  /** Tipo de salario AXA: "1"=Básico, "2"=Integral. */
  tipoSalario: '1',
  /** Modalidad de trabajo: "01"=Presencial, "02"=Teletrabajo, etc. */
  modalidadTrabajo: '01',
  /** Tarea de alto riesgo: "0000001"=No aplica, "0000002"=Alturas, etc. */
  tareaAltoRiesgo: '0000001',
} as const;

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
  /** Mapeo por nivel: centro de trabajo + grupo/tipo de ocupación.
   *  La función pura recibe la lista; quien la llama hace el query a
   *  EmpresaNivelRiesgo. Cada campo es null si no se configuró
   *  override por nivel — el resolver cae al default de empresa. */
  nivelesCentros: Array<{
    nivel: NivelRiesgo;
    codigoCentroTrabajo: string | null;
    grupoOcupacion: string | null;
    tipoOcupacion: string | null;
  }>;
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
  // Quemados
  tipoSalario: string;
  modalidadTrabajo: string;
  tareaAltoRiesgo: string;
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

  // Para cada campo "por nivel": si el mapeo del nivel tiene valor,
  // gana; si es null, cae al default de empresa.
  const mapeo = snap.nivelesCentros.find((m) => m.nivel === nivelAfiliacion);
  const centro = mapeo?.codigoCentroTrabajo ?? snap.colpatriaCodigoSucursalDefault;
  const grupoOcup = mapeo?.grupoOcupacion ?? snap.colpatriaGrupoOcupacionDefault!;
  const tipoOcup = mapeo?.tipoOcupacion ?? snap.colpatriaTipoOcupacionDefault!;

  return {
    aplicacion: snap.colpatriaAplicacion!,
    perfil: snap.colpatriaPerfil!,
    empresaIdInterno: snap.colpatriaEmpresaIdInterno!,
    afiliacionId: snap.colpatriaAfiliacionId!,
    nitEmpresaMision: snap.nit, // confirmado: afiliante = misión
    codigoSucursal: snap.colpatriaCodigoSucursalDefault!,
    codigoCentroTrabajo: centro ?? null,
    tipoAfiliacion: snap.colpatriaTipoAfiliacionDefault!,
    grupoOcupacion: grupoOcup,
    tipoOcupacion: tipoOcup,
    // Quemados — no dependen de empresa ni afiliación.
    tipoSalario: COLPATRIA_HARDCODED.tipoSalario,
    modalidadTrabajo: COLPATRIA_HARDCODED.modalidadTrabajo,
    tareaAltoRiesgo: COLPATRIA_HARDCODED.tareaAltoRiesgo,
  };
}
