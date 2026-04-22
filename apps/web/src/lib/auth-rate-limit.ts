import { prisma } from '@pila/db';

/**
 * Política de rate limit para intentos de login.
 *
 * Cada intento se persiste en dos lugares:
 *  - `LoginAttempt` — granular, usado para contar dentro de la ventana.
 *  - `AuditLog` — solo eventos significativos (login exitoso, bloqueo),
 *    para trazabilidad en la bitácora global del sistema.
 *
 *  - Si un email acumula `MAX_FAILED_ATTEMPTS` intentos fallidos en
 *    `LOCK_WINDOW_MS` milisegundos, queda bloqueado.
 *  - El bloqueo dura `LOCK_WINDOW_MS` desde el ÚLTIMO intento fallido.
 *  - Un login exitoso limpia los intentos fallidos previos.
 */
export const MAX_FAILED_ATTEMPTS = 3;
export const LOCK_WINDOW_MS = 10 * 60 * 1000; // 10 minutos

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

  const fallidos = await prisma.loginAttempt.findMany({
    where: { email: e, success: false, createdAt: { gte: desde } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

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
  await prisma.loginAttempt.create({
    data: {
      email: e,
      success: false,
      motivo,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    },
  });

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
