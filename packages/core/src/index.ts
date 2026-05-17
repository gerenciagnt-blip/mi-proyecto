export const APP_NAME = 'Sistema PILA';
export const APP_VERSION = '0.1.0';

export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = <E = string>(error: E): Result<never, E> => ({ ok: false, error });

// Colpatria — config resolver compartido entre web y bot.
// Antes vivía duplicado en apps/web y apps/bot-colpatria.
export {
  COLPATRIA_HARDCODED,
  validarConfigCompleta,
  resolverConfigParaAfiliacion,
  type EmpresaConfigSnapshot,
  type ConfigResuelta,
  type ErroresConfig,
  type NivelRiesgo,
} from './colpatria/config-resolver';
