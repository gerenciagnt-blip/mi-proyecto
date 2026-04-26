import type { BrowserContext } from 'playwright';
import { prisma } from '@pila/db';
import { encrypt, decrypt } from './crypto.js';
import { createLogger } from './logger.js';

const log = createLogger('session');

/**
 * Cache de sesión del bot Colpatria por empresa.
 *
 * El portal AXA tiene sesiones que duran horas (no las vencen rápido).
 * Para no loguear N veces al día por empresa (con 50–70 jobs diarios
 * sería ruido sospechoso para Colpatria), guardamos las cookies del
 * browser tras un login exitoso y las reusamos hasta que el portal nos
 * tire a /Autenticacion.
 *
 * Estrategia:
 *   1. Antes de procesar jobs de una empresa, cargamos su `ColpatriaSesion`
 *      si existe y `expiraEn > now` → set storageState en el context.
 *   2. Si la sesión es null o expiró → login fresco al inicio.
 *   3. Tras login OK → guardar nuevo storageState con expiración a 8h
 *      (conservador — mejor que el bot revalide más seguido a que se
 *      quede con una sesión muerta a media tarea).
 *   4. Si en medio del proceso detectamos redirect a /Autenticacion →
 *      borramos la sesión cacheada y volvemos a loguear.
 */

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

export type StorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage?: Array<{ name: string; value: string }>;
  }>;
};

/**
 * Carga la sesión cacheada de una empresa en formato Playwright
 * `storageState`. Devuelve null si no hay sesión válida.
 */
export async function cargarSesion(empresaId: string): Promise<StorageState | null> {
  const sesion = await prisma.colpatriaSesion.findUnique({
    where: { empresaId },
  });
  if (!sesion) return null;
  if (sesion.expiraEn && sesion.expiraEn.getTime() < Date.now()) {
    log.info({ empresaId, expiraEn: sesion.expiraEn }, 'sesión cacheada expirada, login fresco');
    await invalidarSesion(empresaId);
    return null;
  }
  try {
    const json = decrypt(sesion.cookiesEnc);
    return JSON.parse(json) as StorageState;
  } catch (err) {
    log.warn(
      { empresaId, err: err instanceof Error ? err.message : String(err) },
      'falló al descifrar sesión, descartando',
    );
    await invalidarSesion(empresaId);
    return null;
  }
}

/**
 * Guarda el storageState actual del browser context como sesión
 * cacheada para la empresa. Encripta antes de persistir.
 */
export async function guardarSesion(empresaId: string, context: BrowserContext): Promise<void> {
  const state = await context.storageState();
  const enc = encrypt(JSON.stringify(state));
  const expiraEn = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.colpatriaSesion.upsert({
    where: { empresaId },
    create: { empresaId, cookiesEnc: enc, expiraEn },
    update: { cookiesEnc: enc, expiraEn },
  });
  log.info({ empresaId, expiraEn }, 'sesión guardada');
}

/**
 * Borra la sesión cacheada — al detectar redirect a login o cuando se
 * cambian credenciales en el panel de admin.
 */
export async function invalidarSesion(empresaId: string): Promise<void> {
  await prisma.colpatriaSesion.deleteMany({ where: { empresaId } });
  log.info({ empresaId }, 'sesión invalidada');
}
