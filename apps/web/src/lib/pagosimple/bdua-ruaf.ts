/**
 * Consulta BDUA/RUAF — afiliación actual de un cotizante en las bases de
 * datos únicas del Ministerio de Salud (BDUA) y de Afiliaciones al SGSS
 * (RUAF).
 *
 * Se usa en el formulario de "Nueva afiliación" para autocompletar:
 *   - nombres y apellidos del cotizante
 *   - EPS actual (código BDUA)
 *   - AFP actual (código RUAF) y flag de pensionado
 *
 * Endpoint (Swagger PagoSimple — API Planillas):
 *   POST /bdua-ruaf/data
 *   headers: nit, token  (NO requiere session_token ni auth_token)
 *   body:    { document_type, document }
 *   data:    BduaRuafItem[]  — una fila por cotizante + beneficiarios
 *
 * Nota: la API puede retornar lista vacía si la persona no está afiliada
 * a ningún subsistema. Ese caso se maneja como `null` arriba.
 */

import { pagosimpleRequest } from './client';
import { getSessionTokens } from './auth';
import { requirePagosimpleConfig } from './config';
import type { BduaRuafRequest, BduaRuafItem } from './types';

export const BDUA_RUAF_PATH = '/bdua-ruaf/data';

/**
 * Consulta la lista cruda de registros BDUA/RUAF bajo un documento.
 * Retorna array (posiblemente vacío).
 *
 * Headers minimalistas (`nit` + `token`) según Swagger oficial — el
 * endpoint NO usa session_token, y si lo enviamos lo ignora.
 */
export async function consultarBduaRuaf(
  documentType: string,
  document: string,
): Promise<BduaRuafItem[]> {
  const { token } = await getSessionTokens();
  const cfg = requirePagosimpleConfig();
  const body: BduaRuafRequest = { document_type: documentType, document };
  const data = await pagosimpleRequest<BduaRuafItem[]>(BDUA_RUAF_PATH, {
    method: 'POST',
    headers: { nit: cfg.masterNit, token },
    body,
  });
  return Array.isArray(data) ? data : [];
}

/**
 * Atajo: obtiene el registro del cotizante principal (affiliate_type='C').
 * Si hay varios o ninguno, retorna null.
 */
export async function consultarCotizanteBduaRuaf(
  documentType: string,
  document: string,
): Promise<BduaRuafItem | null> {
  const items = await consultarBduaRuaf(documentType, document);
  if (items.length === 0) return null;
  const cotizante = items.find((i) => i.affiliate_type === 'C');
  return cotizante ?? items[0] ?? null;
}
