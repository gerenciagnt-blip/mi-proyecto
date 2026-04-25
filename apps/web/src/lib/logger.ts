/**
 * Logger estructurado del sistema PILA.
 *
 * Reglas:
 *   - En desarrollo (`NODE_ENV=development`) usamos `pino-pretty` para
 *     ver logs legibles en la consola con colores.
 *   - En producción emitimos JSON crudo a stdout — Vercel/AWS Logs los
 *     ingiere directo y los visores (Datadog, Logtail, etc.) los
 *     entienden sin transformar.
 *   - Nivel mínimo controlado por `LOG_LEVEL` (default `info`).
 *
 * Patrón de uso:
 *
 *   import { logger } from '@/lib/logger';
 *   const log = logger.child({ scope: 'pagosimple' });
 *   log.info({ planillaId, status }, 'planilla validada');
 *   log.error({ err, planillaId }, 'fallo al subir TXT');
 *
 * Pasá objetos como primer arg para que pino los serialice como campos
 * estructurados (luego se filtran por `scope`, `planillaId`, etc.). El
 * mensaje literal va como segundo arg.
 *
 * NUNCA registres credenciales (token, secret_key, password). El módulo
 * marca esos nombres como redacted en serializers.
 */

import { pino, type Logger } from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Lista de propiedades que NUNCA se loggean. Si aparecen en un objeto
 * pasado a un log, se reemplazan por "[REDACTED]". Cubre los nombres
 * típicos de credenciales que circulan por el código (PagoSimple,
 * NextAuth, Postgres).
 */
const REDACT_KEYS = [
  '*.password',
  '*.passwordHash',
  '*.secret_key',
  '*.secretKey',
  '*.auth_token',
  '*.token',
  '*.session_token',
  '*.AUTH_SECRET',
  '*.DATABASE_URL',
  // Si el header carga creds (axios/fetch wrappers), los redactamos también.
  'headers.authorization',
  'headers.Authorization',
  'headers.token',
  'headers.session_token',
];

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: '@pila/web' },
  redact: { paths: REDACT_KEYS, censor: '[REDACTED]' },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname,service',
          },
        },
      }
    : {}),
});

/**
 * Atajo para crear un logger con scope. Equivalente a
 * `logger.child({ scope })` pero más corto en sitios de uso frecuente.
 */
export function createLogger(scope: string): Logger {
  return logger.child({ scope });
}
