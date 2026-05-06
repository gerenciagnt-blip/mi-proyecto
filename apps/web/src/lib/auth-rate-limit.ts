import { prisma } from '@pila/db';
import { withDbRetry } from './db-retry';

/**
 * Política de rate limit para intentos de login.
 *
 * Cada intento se persiste en dos lugares:
 *  - `LoginAttempt` — granular, usado para contar dentro de la ventana.
 *  - `AuditLog` — solo eventos significativos (login exitoso, bloqueo),
 *    para trazabilidad en la bitácora global del sistema.
 *
 * Hay dos buckets independientes que se chequean en orden:
 *  1. **Por email** (estricto, anti-fuerza-bruta dirigida): si un email
 *     acumula `MAX_FAILED_ATTEMPTS` intentos fallidos en `LOCK_WINDOW_MS`,
 *     queda bloqueado. Un login exitoso limpia el contador.
 *  2. **Por IP** (laxo, anti-credential-stuffing distribuido): si una
 *     IP acumula `MAX_FAILED_BY_IP` fallos en `IP_LOCK_WINDOW_MS`,
 *     queda bloqueada — independiente del email usado. Esto detiene
 *     bots que rotan emails contra una lista de credenciales filtradas.
 *
 * Los umbrales del bucket por IP son más laxos que los por email
 * porque varios usuarios legítimos pueden compartir IP (oficinas,
 * NAT corporativo, ISPs móviles).
 */
export const MAX_FAILED_ATTEMPTS = 3;
export const LOCK_WINDOW_MS = 10 * 60 * 1000; // 10 minutos
export const MAX_FAILED_BY_IP = 30;
export const IP_LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

export type LoginAttemptMotivo =
  | 'password_wrong'
  | 'user_inactive'
  | 'unknown_email'
  | 'rate_limited';

export type RateLimitStatus = {
  bloqueado: boolean;
  intentosFallidos: number; // cuántos quedan dentro de la ventana
  desbloqueoEn: Date | null; // null si no está bloqueado
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Consulta la cantidad de intentos FALLIDOS del email dentro de la ventana
 * de 10 minutos. Devuelve también cuándo se "desbloquea" (10 min después
 * del último fallo) si está por encima del umbral.
 */
export async function getRateLimitStatus(email: string): Promise<RateLimitStatus> {
  const e = normalizeEmail(email);
  const desde = new Date(Date.now() - LOCK_WINDOW_MS);

  // Retry transitorio: Neon (free tier) hace auto-suspend del compute
  // tras unos minutos de inactividad y la PRIMERA query suele fallar con
  // "Can't reach database server" mientras el endpoint se despierta.
  // Esta es la primera query del login → la más afectada por cold-start.
  const fallidos = await withDbRetry(
    () =>
      prisma.loginAttempt.findMany({
        where: { email: e, success: false, createdAt: { gte: desde } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    { label: 'getRateLimitStatus' },
  );

  if (fallidos.length < MAX_FAILED_ATTEMPTS) {
    return {
      bloqueado: false,
      intentosFallidos: fallidos.length,
      desbloqueoEn: null,
    };
  }

  // Bloqueado — el desbloqueo es 10 min después del ÚLTIMO intento
  const ultimo = fallidos[0]!.createdAt;
  const desbloqueoEn = new Date(ultimo.getTime() + LOCK_WINDOW_MS);
  return {
    bloqueado: desbloqueoEn.getTime() > Date.now(),
    intentosFallidos: fallidos.length,
    desbloqueoEn,
  };
}

/**
 * Registra un intento fallido. Si era el primer intento y está dentro
 * del umbral, no bloquea. Si supera el umbral, el próximo `getRateLimitStatus`
 * devolverá bloqueado=true.
 *
 * Además:
 *  - Siempre escribe en `LoginAttempt`.
 *  - Escribe en `AuditLog` solo los bloqueos por rate-limit (evento
 *    significativo); los fallos rutinarios de contraseña no ensucian
 *    la bitácora del sistema.
 */
export async function registrarIntentoFallido(
  email: string,
  motivo: LoginAttemptMotivo,
  meta?: { ip?: string; userAgent?: string },
): Promise<void> {
  const e = normalizeEmail(email);
  await withDbRetry(
    () =>
      prisma.loginAttempt.create({
        data: {
          email: e,
          success: false,
          motivo,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
      }),
    { label: 'registrarIntentoFallido' },
  );

  if (motivo === 'rate_limited') {
    await prisma.auditLog.create({
      data: {
        entidad: 'Auth',
        entidadId: e,
        accion: 'LOGIN_BLOCKED',
        userName: e,
        descripcion: 'Intento bloqueado por rate-limit (3 fallos / 10 min).',
        cambios: meta ? { ip: meta.ip, userAgent: meta.userAgent } : undefined,
      },
    });
  }
}

/**
 * Registra un login exitoso en `LoginAttempt` y en `AuditLog`, y LIMPIA
 * los intentos fallidos previos (reinicia el contador).
 */
export async function registrarIntentoExitoso(
  email: string,
  userInfo?: { id?: string; name?: string },
  meta?: { ip?: string; userAgent?: string },
): Promise<void> {
  const e = normalizeEmail(email);
  await prisma.$transaction([
    prisma.loginAttempt.create({
      data: {
        email: e,
        success: true,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      },
    }),
    // Limpia los fallidos del mismo email — reinicia el contador.
    prisma.loginAttempt.deleteMany({
      where: { email: e, success: false },
    }),
    prisma.auditLog.create({
      data: {
        entidad: 'Auth',
        entidadId: userInfo?.id ?? e,
        accion: 'LOGIN',
        userId: userInfo?.id,
        userName: userInfo?.name ?? e,
        descripcion: 'Login exitoso',
        cambios: meta ? { ip: meta.ip, userAgent: meta.userAgent } : undefined,
      },
    }),
  ]);
}

/**
 * Mensaje amistoso con el tiempo restante para desbloqueo.
 */
export function formatearMensajeBloqueo(desbloqueoEn: Date): string {
  const ms = desbloqueoEn.getTime() - Date.now();
  if (ms <= 0) return 'Puedes intentar nuevamente.';
  const mins = Math.ceil(ms / 60000);
  return `Demasiados intentos fallidos. Intenta nuevamente en ${mins} ${
    mins === 1 ? 'minuto' : 'minutos'
  }.`;
}

/**
 * Cuenta los fallos `success=false` para una IP dentro de la ventana
 * `IP_LOCK_WINDOW_MS` y decide si está bloqueada.
 *
 * Si la IP es null (header no presente — ej. local sin proxy), retorna
 * "no bloqueado" sin consultar BD.
 */
export async function getRateLimitStatusByIp(ip: string | null): Promise<RateLimitStatus> {
  if (!ip) {
    return { bloqueado: false, intentosFallidos: 0, desbloqueoEn: null };
  }
  const desde = new Date(Date.now() - IP_LOCK_WINDOW_MS);
  const fallidos = await withDbRetry(
    () =>
      prisma.loginAttempt.findMany({
        where: { ip, success: false, createdAt: { gte: desde } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    { label: 'getRateLimitStatusByIp' },
  );

  if (fallidos.length < MAX_FAILED_BY_IP) {
    return {
      bloqueado: false,
      intentosFallidos: fallidos.length,
      desbloqueoEn: null,
    };
  }

  const ultimo = fallidos[0]!.createdAt;
  const desbloqueoEn = new Date(ultimo.getTime() + IP_LOCK_WINDOW_MS);
  return {
    bloqueado: desbloqueoEn.getTime() > Date.now(),
    intentosFallidos: fallidos.length,
    desbloqueoEn,
  };
}

/**
 * Extrae la IP del cliente desde los headers HTTP. Detrás de un proxy
 * (típico en Vercel, DigitalOcean App Platform, Caddy reverso) la IP
 * real viaja en `x-forwarded-for` (formato "cliente, proxy1, proxy2").
 * Como fallback, algunos proxies usan `x-real-ip`.
 *
 * Retorna `null` si no encuentra ninguno (ej. dev local sin proxy).
 */
export function extraerIpDeHeaders(h: Headers): string | null {
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const primera = xff.split(',')[0]?.trim();
    if (primera) return primera;
  }
  return h.get('x-real-ip') ?? null;
}
