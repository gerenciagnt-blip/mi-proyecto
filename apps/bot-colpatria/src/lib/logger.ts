import { pino } from 'pino';

/**
 * Logger del bot. En dev usa pino-pretty para legibilidad. En CI / prod
 * (cuando NODE_ENV !== 'development' o LOG_FORMAT=json) emite JSON crudo
 * que GitHub Actions y los visores ingeren directo.
 *
 * Diseño consistente con apps/web/src/lib/logger.ts pero local — el bot
 * no comparte estado con el web app.
 */
const isDev = process.env.NODE_ENV !== 'production' && process.env.LOG_FORMAT !== 'json';

/**
 * Hook a Sentry: cuando un log con nivel >= 50 (error/fatal) sale, se
 * captura también en Sentry. Lazy import para no cargar el SDK si no
 * está configurado.
 *
 * Fire-and-forget — un fallo de Sentry no debe bloquear el logger ni el
 * flujo del bot.
 */
async function forwardToSentry(level: number, obj: unknown): Promise<void> {
  // Niveles pino: trace=10, debug=20, info=30, warn=40, error=50, fatal=60
  if (level < 50) return;
  if (!process.env.SENTRY_DSN) return;
  try {
    const { captureError } = await import('./sentry.js');
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

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: '@pila/bot-colpatria' },
  redact: {
    paths: [
      '*.password',
      '*.passwordHash',
      '*.cookiesEnc',
      '*.colpatriaPasswordEnc',
      'headers.authorization',
    ],
    censor: '[REDACTED]',
  },
  hooks: {
    logMethod(args, method, levelNum) {
      if (levelNum >= 50) {
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

export function createLogger(scope: string) {
  return logger.child({ scope });
}
