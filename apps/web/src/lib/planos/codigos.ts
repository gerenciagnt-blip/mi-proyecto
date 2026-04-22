import type {
  TipoDocumento,
  NivelRiesgo,
  Modalidad,
} from '@pila/db';

/**
 * Mapeos entre los enums internos del sistema y los códigos oficiales
 * PILA de la resolución 2388/2016.
 */

/**
 * Tipo documento cotizante (campo 3 del registro tipo 2).
 * Valores válidos: CC, CE, TI, PA, CD, SC, RC.
 *
 * Nuestro enum `TipoDocumento` incluye NIT (para empresas/aportantes) que
 * no aplica en el registro de cotizante; NIP tampoco es oficial PILA.
 */
export function tipoDocPila(td: TipoDocumento): string {
  const map: Partial<Record<TipoDocumento, string>> = {
    CC: 'CC',
    CE: 'CE',
    TI: 'TI',
    PAS: 'PA',
    RC: 'RC',
    // NIT y NIP no aplican para cotizante — devolvemos string vacío
    // (el generador decidirá si deja blanco o rechaza).
  };
  return map[td] ?? '';
}

/**
 * Tipo documento del aportante (campo 5 del encabezado).
 * Para nuestro caso — empresas o cotizantes independientes:
 *   - Empresa con NIT → "NI"
 *   - Persona natural → "CC" / "CE" / etc.
 */
export function tipoDocAportantePila(td: TipoDocumento | 'NIT'): string {
  if (td === 'NIT') return 'NI';
  return tipoDocPila(td as TipoDocumento);
}

/**
 * Código de tipo de cotizante (campo 5 del registro 2).
 * Solo mapeamos los más comunes por ahora (1 = Dependiente, 3 = Indep).
 * Los demás se pueden ampliar cuando aparezcan casos.
 *
 * NOTA: se guarda como string "01" a "60" según resolución.
 */
export function tipoCotizantePila(modalidad: Modalidad): string {
  // TODO (futuro): si TipoCotizante.codigo del catálogo tiene un código
  // PILA oficial (ej. "12" para aprendices lectiva, "51" tiempo parcial),
  // usar ese. Por ahora inferimos desde la modalidad.
  if (modalidad === 'DEPENDIENTE') return '01';
  if (modalidad === 'INDEPENDIENTE') return '03';
  return '00';
}

/** Subtipo cotizante — por default "00" (sin subtipo). */
export function subtipoCotizantePila(): string {
  return '00';
}

/**
 * Clase de riesgo PILA (campo 78): I=1, II=2, III=3, IV=4, V=5.
 */
export function claseRiesgoPila(nr: NivelRiesgo | null | undefined): string {
  if (!nr) return '0';
  const map: Record<NivelRiesgo, string> = {
    I: '1',
    II: '2',
    III: '3',
    IV: '4',
    V: '5',
  };
  return map[nr] ?? '0';
}

/**
 * Decide si el cotizante está exonerado de aportes (Ley 1607 de 2012):
 * S o N. Reglas:
 *  - Solo aplica a DEPENDIENTES (tipo cotizante 01).
 *  - La empresa debe tener `exoneraLey1607 = true`.
 *  - El IBC salud NO debe superar 10 SMLMV (regla de la resolución).
 */
export function exoneraLey1607Pila({
  modalidad,
  empresaExonera,
  ibcSalud,
  smlv,
}: {
  modalidad: Modalidad;
  empresaExonera: boolean | null | undefined;
  ibcSalud: number;
  smlv: number;
}): 'S' | 'N' {
  if (modalidad !== 'DEPENDIENTE') return 'N';
  if (!empresaExonera) return 'N';
  if (smlv > 0 && ibcSalud > smlv * 10) return 'N';
  return 'S';
}
