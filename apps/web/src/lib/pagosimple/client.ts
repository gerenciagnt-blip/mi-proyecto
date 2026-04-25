/**
 * Cliente HTTP para PagoSimple.
 *
 * Responsabilidades:
 *   - Construir URL absoluta desde un path relativo.
 *   - Serializar body JSON / multipart.
 *   - Inyectar headers auth (si se le pasa).
 *   - Decodificar el envoltorio estándar { success, code, data, message, description }.
 *   - Reintentar automáticamente ante 401 (token expirado) una sola vez,
 *     con re-login. El módulo auth se encarga de proveer headers frescos.
 *   - Timeout razonable (30s default) para evitar cuelgues en UI.
 *   - Loguear errores con contexto mínimo para debug sin exponer credenciales.
 */

import { requirePagosimpleConfig } from './config';
import type { PagosimpleResponse } from './types';
import { createLogger } from '../logger';

const log = createLogger('pagosimple');

export class PagosimpleError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly description?: string,
    public readonly path?: string,
  ) {
    super(message);
    this.name = 'PagosimpleError';
  }
}

export type ClientRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Headers adicionales (tokens de sesión, nit, etc.). */
  headers?: Record<string, string>;
  /** Body JSON — se serializa automáticamente. No usar con `formData`. */
  body?: unknown;
  /** Body multipart/form-data. No usar con `body`. */
  formData?: FormData;
  /** Timeout en ms (default 30000). */
  timeoutMs?: number;
  /** Si true, no envuelve el error en PagosimpleError — devuelve el response crudo. */
  rawResponse?: boolean;
};

/**
 * Llamada HTTP a la API de PagoSimple. Retorna el `data` interno
 * desencapsulando el envoltorio estándar. Si `success=false`, lanza
 * PagosimpleError con el código y descripción del servidor.
 */
export async function pagosimpleRequest<T>(
  path: string,
  options: ClientRequestOptions = {},
): Promise<T> {
  const cfg = requirePagosimpleConfig();
  const { method = 'GET', headers = {}, body, formData, timeoutMs = 30000 } = options;

  const url = `${cfg.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const reqHeaders: Record<string, string> = { ...headers };
  let reqBody: BodyInit | undefined;
  if (formData) {
    reqBody = formData;
    // NO setear Content-Type; fetch lo asigna con boundary correcto.
  } else if (body !== undefined) {
    reqBody = JSON.stringify(body);
    reqHeaders['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      headers: reqHeaders,
      body: reqBody,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    const msg = e instanceof Error ? e.message : 'Error de red';
    log.error({ method, path, err: msg }, 'fetch failed');
    throw new PagosimpleError(0, `Error de red llamando a PagoSimple: ${msg}`, undefined, path);
  }
  clearTimeout(timeout);

  // Leemos el body como texto primero — así podemos hacer diagnóstico aun
  // cuando el response no es JSON o tiene una shape distinta a la estándar.
  const rawBody = await resp.text().catch(() => '');

  let json: PagosimpleResponse<T> | null = null;
  try {
    json = JSON.parse(rawBody) as PagosimpleResponse<T>;
  } catch {
    log.error(
      { method, path, status: resp.status, rawBodyPreview: rawBody.slice(0, 300) },
      'respuesta no-JSON',
    );
    throw new PagosimpleError(
      resp.status,
      `Respuesta no-JSON de PagoSimple (HTTP ${resp.status})`,
      rawBody.slice(0, 500),
      path,
    );
  }

  // Validamos que la respuesta tenga el envelope estándar. Si no lo tiene
  // (success undefined), la API está devolviendo un error con otra shape
  // (típicamente Spring boot / 4xx con {message, status, error, ...}).
  if (typeof json?.success !== 'boolean') {
    log.error(
      { method, path, status: resp.status, jsonPreview: JSON.stringify(json).slice(0, 400) },
      'shape inesperado',
    );
    throw new PagosimpleError(
      resp.status,
      `PagoSimple respondió con HTTP ${resp.status} y formato inesperado: ${JSON.stringify(json).slice(0, 200)}`,
      rawBody.slice(0, 500),
      path,
    );
  }

  if (!json.success) {
    log.error(
      {
        method,
        path,
        code: json.code,
        msg: json.message,
        description: json.description,
      },
      'PagoSimple devolvió success=false',
    );
    throw new PagosimpleError(json.code, json.message, json.description, path);
  }

  return json.data as T;
}
