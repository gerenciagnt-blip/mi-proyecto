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
 * Hook a Sentry: cuando un log con nivel >= 50 (error/fatal) sale, se
 * captura también en Sentry. Lazy import para no cargar el SDK si no
 * está configurado.
 *
 * No hacemos `await` — el envío a Sentry es fire-and-forget y no debe
 * bloquear ni romper el flujo del logger.
 */
async function forwardToSentry(level: number, obj: unknown): Promise<void> {
  // Niveles pino: trace=10, debug=20, info=30, warn=40, error=50, fatal=60
  if (level < 50) return;
  if (!process.env.SENTRY_DSN) return;
  try {
    const { captureError } = await import('./sentry');
    // Si el log incluyó un Error en el objeto, lo capturamos como tal.
    let err: unknown = obj;
    let extra: Record<string, unknown> | undefined;
    if (obj && typeof obj === 'object') {
      const objWithErr = obj as Record<string, unknown>;
      if (objWithErr.err instanceof Error) {
        err = objWithErr.err;
        extra = { ...objWithErr };
        delete extra.err;
      } else {
        extra = { ...objWithErr };
      }
    }
    await captureError(err, extra);
  } catch {
    // Silencioso: no debemos provocar más errores desde el logger.
  }
}

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
  // Hook a Sentry — se llama después de cada log emitido. No bloquea.
  hooks: {
    logMethod(args, method, levelNum) {
      if (levelNum >= 50) {
        // El primer arg de pino es el objeto extra (si lo hay) o el mensaje.
        const obj = typeof args[0] === 'object' ? args[0] : undefined;
        void forwardToSentry(levelNum, obj);
      }
      method.apply(this, args);
    },
  },
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
