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
