import type { ResultadoVerificacion } from '../pages/ingreso-individual.js';

export type EventoColpatria = 'CREAR' | 'REACTIVAR';

export type Decision =
  | { kind: 'PROCEDER'; modo: 'CREAR' | 'REACTIVAR'; warnings?: string[] }
  | { kind: 'FALLAR'; mensaje: string; retryable: boolean };

/**
 * Decide qué hacer con un job en función del evento que pidió la web y
 * lo que el portal AXA devolvió tras BUSCAR.
 *
 * AXA no distingue internamente entre CREAR y REACTIVAR: es el mismo
 * formulario, los mismos campos, el mismo mensaje de éxito y el mismo
 * comprobante PDF. La única diferencia es el botón de submit (Ingresar
 * Empleado vs Modificar) y que en REACTIVAR el form aparece pre-cargado.
 *
 * El concepto operativo de REACTIVAR es: volver a disparar la afiliación
 * con los datos *actuales* (que pueden haber cambiado: empresa planilla,
 * info personal, niveles de riesgo, etc.). Por eso siempre se rellena
 * el form completo.
 *
 * El sub-caso `EXISTE` se distingue por `idOperacion`:
 *   - `'?'` → AXA bloqueó con modal "Ya existe un empleado vigente",
 *     significa que el empleado está ACTIVO y no requiere reactivación.
 *   - número real → form pre-cargado con `ID_OPERACION != 0`, significa
 *     que el empleado existe en estado modificable.
 */
export function decidirAccion(
  verif: ResultadoVerificacion,
  evento: EventoColpatria,
  options: { reactivarEnabled?: boolean } = {},
): Decision {
  const reactivarEnabled = options.reactivarEnabled ?? true;

  if (verif.kind === 'ERROR') {
    return { kind: 'FALLAR', mensaje: verif.mensaje, retryable: true };
  }

  if (evento === 'REACTIVAR' && !reactivarEnabled) {
    return {
      kind: 'FALLAR',
      mensaje: 'Evento REACTIVAR deshabilitado por flag (COLPATRIA_REACTIVAR_ENABLED=false)',
      retryable: false,
    };
  }

  if (evento === 'CREAR') {
    if (verif.kind === 'NUEVO') {
      return { kind: 'PROCEDER', modo: 'CREAR' };
    }
    return {
      kind: 'FALLAR',
      mensaje:
        `Empleado ya existe en AXA (ID_OPERACION=${verif.idOperacion}); ` +
        `el job vino con evento CREAR. Cambiar a REACTIVAR si corresponde.`,
      retryable: false,
    };
  }

  if (verif.kind === 'NUEVO') {
    return {
      kind: 'PROCEDER',
      modo: 'CREAR',
      warnings: ['Job vino como REACTIVAR pero AXA no tenía el empleado; se crea como nuevo'],
    };
  }

  if (verif.idOperacion === '?') {
    return {
      kind: 'FALLAR',
      mensaje:
        'AXA reporta empleado ya vigente — no requiere reactivación. ' +
        'Verificar estado en portal manual.',
      retryable: false,
    };
  }

  return { kind: 'PROCEDER', modo: 'REACTIVAR' };
}

/**
 * Lee la env var `COLPATRIA_REACTIVAR_ENABLED` y devuelve si la rama
 * REACTIVAR debe procesarse. Default: `true`.
 *
 * Setear `COLPATRIA_REACTIVAR_ENABLED=false` para revertir al
 * comportamiento pre-Sprint 8 REACTIVAR (rechazo total) durante un
 * piloto, sin redeploy.
 */
export function reactivarHabilitado(): boolean {
  const v = process.env.COLPATRIA_REACTIVAR_ENABLED;
  if (v === undefined || v === '') return true;
  return v === 'true' || v === '1';
}
