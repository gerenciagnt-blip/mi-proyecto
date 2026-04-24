/**
 * Auth de PagoSimple — gestiona el flujo:
 *
 *   1. POST /auth/login           → { session_token, token }
 *   2. GET  /auth/{id}/{tipo}/{doc} → { auth_token }
 *
 * Cachea los 3 tokens en memoria del proceso con TTL (default 15 min).
 * Si un endpoint devuelve 401, se invalida el cache y se hace refresh
 * automático (un solo reintento para evitar loops).
 *
 * Nota: para serverless / multi-instance esto es best-effort — cada
 * instancia mantiene su propio cache. Si PagoSimple limita sesiones
 * concurrentes, considerar mover a Redis.
 */

import { requirePagosimpleConfig } from './config';
import { pagosimpleRequest } from './client';
import type { LoginRequest, LoginData, AuthData, BaseAuthHeaders, FullAuthHeaders } from './types';

type CachedSession = {
  sessionToken: string;
  token: string;
  /** Epoch ms cuando expira. */
  expiresAt: number;
};

type CachedAuth = {
  authToken: string;
  expiresAt: number;
};

const sessionCache: { current: CachedSession | null } = { current: null };
const authCache: Map<string, CachedAuth> = new Map();

function isFresh(expiresAt: number): boolean {
  // Margen de 1 min para refrescar antes de que expire real.
  return Date.now() < expiresAt - 60_000;
}

/** Fuerza la invalidación del cache (ej. al detectar 401). */
export function invalidatePagosimpleCache(): void {
  sessionCache.current = null;
  authCache.clear();
}

/**
 * Retorna un `{token, session_token}` válido. Hace login si el cache
 * está vacío o expiró.
 */
export async function getSessionTokens(): Promise<LoginData> {
  if (sessionCache.current && isFresh(sessionCache.current.expiresAt)) {
    return {
      token: sessionCache.current.token,
      session_token: sessionCache.current.sessionToken,
    };
  }

  const cfg = requirePagosimpleConfig();
  const body: LoginRequest = {
    document_type: cfg.masterDocumentType,
    document: cfg.masterDocument,
    password: cfg.masterPassword,
    secret_key: cfg.masterSecretKey,
    nit: cfg.masterNit,
    company: cfg.masterCompany,
  };

  const data = await pagosimpleRequest<LoginData>('/auth/login', {
    method: 'POST',
    body,
  });

  sessionCache.current = {
    token: data.token,
    sessionToken: data.session_token,
    expiresAt: Date.now() + cfg.tokenTtlMin * 60_000,
  };
  return data;
}

/**
 * Obtiene auth_token para un usuario específico (por default, el master).
 * Cachea por clave `{id}-{type}-{doc}`.
 *
 * @param id — suele ser el NIT del maestro o un identificador contextual.
 * @param documentType — tipo documento del usuario autorizando.
 * @param document — número documento.
 */
export async function getAuthToken(
  id: string,
  documentType: string,
  document: string,
): Promise<string> {
  const key = `${id}|${documentType}|${document}`;
  const hit = authCache.get(key);
  if (hit && isFresh(hit.expiresAt)) return hit.authToken;

  const { token, session_token } = await getSessionTokens();
  const cfg = requirePagosimpleConfig();

  const data = await pagosimpleRequest<AuthData>(
    `/auth/${encodeURIComponent(id)}/${encodeURIComponent(documentType)}/${encodeURIComponent(document)}`,
    {
      method: 'GET',
      headers: {
        nit: cfg.masterNit,
        token,
        session_token,
      },
    },
  );

  authCache.set(key, {
    authToken: data.auth_token,
    expiresAt: Date.now() + cfg.tokenTtlMin * 60_000,
  });
  return data.auth_token;
}

/**
 * Headers base (nit + token + session_token) — para endpoints que no
 * requieren auth_token adicional (ej. BDUA/RUAF, comprobantes).
 */
export async function getBaseAuthHeaders(): Promise<BaseAuthHeaders> {
  const { token, session_token } = await getSessionTokens();
  const cfg = requirePagosimpleConfig();
  return { nit: cfg.masterNit, token, session_token };
}

/**
 * Headers completos (con auth_token) — para la mayoría de endpoints de
 * aportantes, planillas, pagos, marcación.
 *
 * Por default usa el NIT del maestro como `id`. Para endpoints que
 * requieren autorizar sobre un aportante específico, pasar ese ID.
 */
export async function getFullAuthHeaders(opts?: {
  id?: string;
  documentType?: string;
  document?: string;
}): Promise<FullAuthHeaders> {
  const cfg = requirePagosimpleConfig();
  const id = opts?.id ?? cfg.masterNit;
  const documentType = opts?.documentType ?? cfg.masterDocumentType;
  const document = opts?.document ?? cfg.masterDocument;

  const [base, authToken] = await Promise.all([
    getBaseAuthHeaders(),
    getAuthToken(id, documentType, document),
  ]);
  return { ...base, auth_token: authToken };
}

/**
 * Ejecuta una función que requiere headers PagoSimple, con refresh
 * automático si el primer intento falla por token inválido.
 */
export async function withAuthRetry<T>(
  fn: (headers: FullAuthHeaders) => Promise<T>,
  opts?: { id?: string; documentType?: string; document?: string },
): Promise<T> {
  try {
    const headers = await getFullAuthHeaders(opts);
    return await fn(headers);
  } catch (err) {
    const e = err as { code?: number; message?: string };
    if (e.code === 401 || /401|unauthorized|invalid token/i.test(e.message ?? '')) {
      invalidatePagosimpleCache();
      const headers = await getFullAuthHeaders(opts);
      return fn(headers);
    }
    throw err;
  }
}
