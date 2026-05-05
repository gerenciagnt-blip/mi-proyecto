/**
 * Verificación de firma HMAC-SHA256 para webhooks Efipay.
 *
 * Según la doc oficial (https://efipay.co/docs/1.0/webhook-transaction):
 *   - Efipay envía el header `Signature` con el HMAC-SHA256 del body
 *     usando como secreto el "token para webhooks" del comercio.
 *   - El receptor calcula el mismo HMAC localmente y compara con el header.
 *   - Si coinciden, la carga es legítima. Si no, se rechaza.
 *
 * Compromiso: comparación timing-safe para no leak'ar info por timing
 * attack — cualquier fallo se ve idéntico desde fuera.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Calcula el HMAC-SHA256 del payload con el token y devuelve el hex.
 * Exportado para tests y para reusar si se necesita firmar requests.
 */
export function calcularFirma(payload: string, webhookToken: string): string {
  return createHmac('sha256', webhookToken).update(payload, 'utf8').digest('hex');
}

/**
 * Verifica una firma recibida contra el payload + token.
 *
 * @param rawBody  El body crudo del request — IMPORTANTE pasarlo tal cual
 *                 llegó (no JSON.parse + stringify, que altera el orden o
 *                 espacios y rompe el HMAC).
 * @param firmaRecibida  El header `Signature` del request.
 * @param webhookToken   El token configurado en Efipay (env var).
 * @returns true si la firma coincide, false en cualquier otro caso.
 */
export function verificarFirmaWebhook(
  rawBody: string,
  firmaRecibida: string | null | undefined,
  webhookToken: string,
): boolean {
  if (!firmaRecibida || !webhookToken) return false;

  const firmaCalculada = calcularFirma(rawBody, webhookToken);

  // Limpiar la firma recibida — algunos servicios la mandan con prefix
  // ("sha256=..."). Por si acaso, removemos el prefijo si existe.
  const recibidaLimpia = firmaRecibida.replace(/^sha256=/i, '').toLowerCase();
  const calculadaLimpia = firmaCalculada.toLowerCase();

  // timingSafeEqual exige longitudes iguales — si difieren, ya sabemos
  // que no coinciden, devolver false sin lanzar.
  if (recibidaLimpia.length !== calculadaLimpia.length) return false;

  try {
    return timingSafeEqual(Buffer.from(recibidaLimpia, 'hex'), Buffer.from(calculadaLimpia, 'hex'));
  } catch {
    // hex inválido → buffers de longitud distinta → false
    return false;
  }
}
