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
    // eslint-disable-next-line no-console
    console.error(`[pagosimple] ${method} ${path} — fetch failed: ${msg}`);
    throw new PagosimpleError(0, `Error de red llamando a PagoSimple: ${msg}`, undefined, path);
  }
  clearTimeout(timeout);

  let json: PagosimpleResponse<T> | null = null;
  try {
    json = (await resp.json()) as PagosimpleResponse<T>;
  } catch {
    throw new PagosimpleError(
      resp.status,
      `Respuesta no-JSON de PagoSimple (HTTP ${resp.status})`,
      await resp.text().catch(() => ''),
      path,
    );
  }

  if (!json.success) {
    // eslint-disable-next-line no-console
    console.error(
      `[pagosimple] ${method} ${path} — success=false code=${json.code} msg="${json.message}"`,
    );
    throw new PagosimpleError(json.code, json.message, json.description, path);
  }

  return json.data as T;
}

/**
 * Helper específico para endpoints que suben un archivo (multipart).
 * Construye el FormData con los campos + el archivo.
 */
export async function pagosimpleMultipart<T>(
  path: string,
  fileField: string,
  file: { buffer: Buffer; filename: string },
  extraFields: Record<string, string> = {},
  options: Omit<ClientRequestOptions, 'formData' | 'body' | 'method'> = {},
): Promise<T> {
  const fd = new FormData();
  const blob = new Blob([new Uint8Array(file.buffer)]);
  fd.append(fileField, blob, file.filename);
  for (const [k, v] of Object.entries(extraFields)) {
    fd.append(k, v);
  }
  return pagosimpleRequest<T>(path, {
    ...options,
    method: 'POST',
    formData: fd,
  });
}
