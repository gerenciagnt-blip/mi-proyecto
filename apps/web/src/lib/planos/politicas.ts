import type { Modalidad, Regimen, TipoPlanilla } from '@pila/db';

/**
 * Políticas de negocio para decidir qué tipo(s) de planilla PILA genera
 * una afiliación. Aísla la lógica para que sea fácil de evolucionar
 * cuando aparezcan nuevos planes o regímenes.
 */

export type PlanIncluye = {
  incluyeEps: boolean;
  incluyeAfp: boolean;
  incluyeArl: boolean;
  incluyeCcf: boolean;
};

/**
 * Subtipos de cotizante que NO cotizan a pensión (omisión total de AFP).
 * Cuando un dependiente tiene uno de estos subtipos, en el plano:
 *   - Campo 31 (Cód AFP): vacío
 *   - Campos 36 / 42 / 46 / 47 / 50: 0
 * Aplica sólo para planillas ordinarias. Resolución tiene sus propias
 * reglas que anulan pensión completamente.
 */
export const OMISION_AFP_SUBTIPOS = new Set(['02', '03', '04', '05', '12']);

export function aplicaOmisionPension(subtipoCodigo: string | null | undefined): boolean {
  if (!subtipoCodigo) return false;
  return OMISION_AFP_SUBTIPOS.has(subtipoCodigo);
}

/**
 * Dada la modalidad, régimen y composición del plan SGSS de una
 * afiliación, retorna la lista de tipos de planilla que deben generarse.
 *
 * Casos actualmente soportados:
 *   - ORDINARIO + DEPENDIENTE    → [E]
 *   - ORDINARIO + INDEPENDIENTE  → [I]
 *   - RESOLUCION + plan EPS+ARL  → [E, K]  (dos planillas, mismo comprobante)
 *   - RESOLUCION + plan sólo ARL → [K]
 *
 * El resto de combinaciones de RESOLUCIÓN (ej. EPS solo, EPS+AFP, etc.)
 * quedan como pendientes — se retornan como [E] por default con una
 * advertencia registrable; cuando aparezcan casos concretos se amplía.
 */
export function planillasParaAfiliacion({
  modalidad,
  regimen,
  plan,
}: {
  modalidad: Modalidad;
  regimen: Regimen | null | undefined;
  plan: PlanIncluye | null | undefined;
}): TipoPlanilla[] {
  if (regimen === 'RESOLUCION' && plan) {
    const { incluyeEps, incluyeAfp, incluyeArl, incluyeCcf } = plan;
    // Solo ARL
    if (incluyeArl && !incluyeEps && !incluyeAfp && !incluyeCcf) {
      return ['K'];
    }
    // EPS + ARL (sin AFP ni CCF)
    if (incluyeEps && incluyeArl && !incluyeAfp && !incluyeCcf) {
      return ['E', 'K'];
    }
    // Caso no cubierto — default a E. Idealmente se registra en AuditLog
    // desde el caller.
    return ['E'];
  }

  // Ordinario
  if (modalidad === 'DEPENDIENTE') return ['E'];
  if (modalidad === 'INDEPENDIENTE') return ['I'];
  return [];
}

/**
 * Devuelve las "banderas" que determinan qué subsistemas llena el plano
 * para una línea cotizante, combinando el tipo de planilla y el régimen
 * de la afiliación.
 *
 *   E ordinario:   todos (EPS/AFP/ARL/CCF/SENA/ICBF)
 *   I ordinario:   todos
 *   E resolución:  solo EPS
 *   K (cualquiera): solo ARL
 */
export function banderasSubsistemas({
  tipoPlanilla,
  regimen,
}: {
  tipoPlanilla: TipoPlanilla;
  regimen: Regimen | null | undefined;
}): {
  aplicaEps: boolean;
  aplicaAfp: boolean;
  aplicaArl: boolean;
  aplicaCcf: boolean;
  aplicaSenaIcbf: boolean;
} {
  // Plano K → solo ARL
  if (tipoPlanilla === 'K') {
    return {
      aplicaEps: false,
      aplicaAfp: false,
      aplicaArl: true,
      aplicaCcf: false,
      aplicaSenaIcbf: false,
    };
  }

  // Plano E bajo régimen RESOLUCIÓN → solo EPS
  if (tipoPlanilla === 'E' && regimen === 'RESOLUCION') {
    return {
      aplicaEps: true,
      aplicaAfp: false,
      aplicaArl: false,
      aplicaCcf: false,
      aplicaSenaIcbf: false,
    };
  }

  // Todo lo demás: todos los subsistemas
  return {
    aplicaEps: true,
    aplicaAfp: true,
    aplicaArl: true,
    aplicaCcf: true,
    aplicaSenaIcbf: true,
  };
}

/**
 * Sobrescribe campos de identificación PILA para casos especiales:
 *   E resolución:  tipo doc "PA", tipo cotizante "01", subtipo "04"
 *   K:             tipo cotizante "23", subtipo "00"
 *
 * Los demás casos usan los valores del catálogo.
 */
export function identificacionForzada({
  tipoPlanilla,
  regimen,
}: {
  tipoPlanilla: TipoPlanilla;
  regimen: Regimen | null | undefined;
}): {
  tipoDocOverride: string | null;
  tipoCotizanteOverride: string | null;
  subtipoOverride: string | null;
} {
  if (tipoPlanilla === 'E' && regimen === 'RESOLUCION') {
    return {
      tipoDocOverride: 'PA',
      tipoCotizanteOverride: '01',
      subtipoOverride: '04',
    };
  }
  if (tipoPlanilla === 'K') {
    return {
      tipoDocOverride: null,
      tipoCotizanteOverride: '23',
      subtipoOverride: '00',
    };
  }
  return {
    tipoDocOverride: null,
    tipoCotizanteOverride: null,
    subtipoOverride: null,
  };
}
