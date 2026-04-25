/**
 * Configuración centralizada del cliente PagoSimple.
 *
 * Todas las vars viven en `.env` (raíz del monorepo). Este módulo las lee
 * una sola vez al arrancar y valida que estén presentes antes de cualquier
 * llamada — así los errores de configuración salen temprano y claros en
 * vez de un 401 genérico en un endpoint random.
 */

export type PagosimpleConfig = {
  baseUrl: string;
  masterNit: string;
  masterCompany: string;
  masterSecretKey: string;
  masterDocumentType: string;
  masterDocument: string;
  masterPassword: string;
  tokenTtlMin: number;
};

let cached: PagosimpleConfig | null = null;

/**
 * Lee la configuración de PagoSimple del entorno. Si falta alguna var,
 * retorna null y registra un warning — NO tira error, para que el resto
 * de la app siga funcionando mientras las credenciales llegan.
 *
 * Cualquier módulo que llame a la API debe usar `requirePagosimpleConfig()`
 * en su lugar, que sí tira error si no está configurado.
 */
import { createLogger } from '../logger';

const log = createLogger('pagosimple');

export function getPagosimpleConfig(): PagosimpleConfig | null {
  if (cached) return cached;

  const required = [
    'PAGOSIMPLE_BASE_URL',
    'PAGOSIMPLE_MASTER_NIT',
    'PAGOSIMPLE_MASTER_COMPANY',
    'PAGOSIMPLE_MASTER_SECRET_KEY',
    'PAGOSIMPLE_MASTER_DOCUMENT_TYPE',
    'PAGOSIMPLE_MASTER_DOCUMENT',
    'PAGOSIMPLE_MASTER_PASSWORD',
  ] as const;

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    log.warn({ missing }, 'config incompleta — integración deshabilitada');
    return null;
  }

  cached = {
    baseUrl: process.env.PAGOSIMPLE_BASE_URL!.replace(/\/+$/, ''),
    masterNit: process.env.PAGOSIMPLE_MASTER_NIT!,
    masterCompany: process.env.PAGOSIMPLE_MASTER_COMPANY!,
    masterSecretKey: process.env.PAGOSIMPLE_MASTER_SECRET_KEY!,
    masterDocumentType: process.env.PAGOSIMPLE_MASTER_DOCUMENT_TYPE!,
    masterDocument: process.env.PAGOSIMPLE_MASTER_DOCUMENT!,
    masterPassword: process.env.PAGOSIMPLE_MASTER_PASSWORD!,
    tokenTtlMin: Number(process.env.PAGOSIMPLE_TOKEN_TTL_MIN ?? 15),
  };
  return cached;
}

/** Versión que lanza error si no hay config. */
export function requirePagosimpleConfig(): PagosimpleConfig {
  const cfg = getPagosimpleConfig();
  if (!cfg) {
    throw new Error('PagoSimple no está configurado. Define las variables PAGOSIMPLE_* en .env');
  }
  return cfg;
}

/** ¿Está habilitada la integración? Útil para UI condicional. */
export function isPagosimpleEnabled(): boolean {
  return getPagosimpleConfig() !== null;
}

/** Reset del cache — para tests. */
export function resetPagosimpleConfigCache(): void {
  cached = null;
}
