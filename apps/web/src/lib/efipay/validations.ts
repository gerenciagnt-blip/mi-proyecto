/**
 * Schemas Zod para validar payloads de la integración Efipay.
 *
 * Doc oficial: https://efipay.co/docs/1.0/
 *   - generate-payment (request/response)
 *   - webhook-transaction (payload entrante)
 *
 * El webhook payload no está completamente documentado — usamos `passthrough`
 * para no romper si Efipay agrega campos. Solo validamos los que necesitamos.
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────
// Estados que devuelve Efipay (en español, según la doc)
// ──────────────────────────────────────────────────────────────────────

export const EfipayStatusEnum = z.enum([
  'Aprobada',
  'Pendiente',
  'Rechazada',
  'Expirada',
  'Anulada',
  // Variantes en inglés que también aparecen en algunos endpoints
  'Approved',
  'Pending',
  'Rejected',
  'Expired',
  'Cancelled',
]);

export type EfipayStatus = z.infer<typeof EfipayStatusEnum>;

/** Mapea cualquiera de los strings de Efipay a nuestro enum interno. */
export function mapEfipayStatus(
  status: string,
): 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EXPIRADA' | 'ERROR' {
  const s = status.toLowerCase();
  if (s.includes('aprob') || s === 'approved') return 'APROBADA';
  if (s.includes('rechaz') || s === 'rejected' || s.includes('cancel') || s.includes('anul'))
    return 'RECHAZADA';
  if (s.includes('expir')) return 'EXPIRADA';
  if (s.includes('pend')) return 'PENDIENTE';
  return 'ERROR';
}

// ──────────────────────────────────────────────────────────────────────
// Response de POST /api/v1/payment/generate-payment (checkout_type=redirect)
// ──────────────────────────────────────────────────────────────────────

export const EfipayGeneratePaymentResponseSchema = z
  .object({
    saved: z.boolean(),
    payment_id: z.string(),
    url: z.string().url(),
  })
  .passthrough();

export type EfipayGeneratePaymentResponse = z.infer<typeof EfipayGeneratePaymentResponseSchema>;

// ──────────────────────────────────────────────────────────────────────
// Webhook payload — solo los campos que usamos
// ──────────────────────────────────────────────────────────────────────

export const EfipayWebhookPayloadSchema = z
  .object({
    transaction: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        amount: z.union([z.string(), z.number()]).optional(),
        currency_type: z.string().optional(),
        status: z.string(),
        payment_method: z.string().optional(),
        timestamp: z.string().optional(),
      })
      .passthrough(),
    checkout: z
      .object({
        id: z.string().optional(),
        payment_id: z.string().optional(),
        references: z.array(z.string()).optional(),
        gateway: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type EfipayWebhookPayload = z.infer<typeof EfipayWebhookPayloadSchema>;
