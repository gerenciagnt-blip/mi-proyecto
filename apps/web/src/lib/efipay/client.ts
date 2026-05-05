/**
 * Cliente HTTP de la API Efipay.
 *
 * Doc oficial: https://efipay.co/docs/1.0/generate-transaction
 *
 * Endpoint principal:
 *   POST {baseUrl}/api/v1/payment/generate-payment
 *
 * Headers:
 *   Authorization: Bearer ACCESS_TOKEN
 *   Content-Type: application/json
 *
 * Body:
 *   {
 *     office: <office_id>,
 *     payment: {
 *       description: string (4-191 chars),
 *       amount: number (max 10 dígitos, 2 decimales),
 *       currency_type: 'COP',
 *       checkout_type: 'redirect'
 *     },
 *     advanced_options: {
 *       references: [<consecutivo>],   // hasta 3, 50 chars c/u
 *       result_urls: { approved, rejected, pending, webhook },
 *       payment_methods: { credit, pse, cash }  // todos true
 *     }
 *   }
 *
 * Response (redirect):
 *   { saved: true, payment_id: <UUID>, url: <checkout_url> }
 */

import { createLogger } from '@/lib/logger';
import { getEfipayConfig, validateEfipayConfig, type EfipayConfig } from './config';
import {
  EfipayGeneratePaymentResponseSchema,
  type EfipayGeneratePaymentResponse,
} from './validations';

const log = createLogger('efipay-client');

export type CrearPagoInput = {
  /** Texto descriptivo (4-191 chars). Ej: "Cobro mensual operador · CA-000123". */
  descripcion: string;
  /** Monto a cobrar (incluye sobrecosto). Hasta 2 decimales. */
  monto: number;
  /** Lista de referencias a enviar (hasta 3, 50 chars c/u). La 1ra es el consecutivo. */
  referencias: string[];
};

export type CrearPagoResultado =
  | {
      ok: true;
      paymentId: string;
      checkoutUrl: string;
      raw: EfipayGeneratePaymentResponse;
    }
  | { ok: false; error: string; statusCode?: number };

/**
 * Crea un pago en Efipay y devuelve el `payment_id` + URL de checkout
 * para redirigir al aliado.
 *
 * Errores:
 *   - Config incompleta → { ok: false, error: '...' } sin tocar la red
 *   - HTTP no-2xx       → { ok: false, error, statusCode }
 *   - Response malformada → { ok: false, error }
 *   - Network/timeout   → { ok: false, error: 'network ...' }
 */
export async function crearPagoEfipay(input: CrearPagoInput): Promise<CrearPagoResultado> {
  const cfg = getEfipayConfig();
  const cfgError = validateEfipayConfig(cfg);
  if (cfgError) {
    log.error({ cfgError }, 'Efipay config incompleta — no se puede crear pago');
    return { ok: false, error: `Configuración Efipay incompleta: ${cfgError}` };
  }

  const body = construirBodyGeneratePayment(cfg, input);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/api/v1/payment/generate-payment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // 20s — Efipay puede tardar en validar el comercio en sandbox
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'Efipay generate-payment falló a nivel red');
    return { ok: false, error: `Error de red al contactar Efipay: ${msg}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ statusCode: res.status, err: msg }, 'Efipay devolvió body no-JSON');
    return {
      ok: false,
      error: `Efipay devolvió respuesta no-JSON (HTTP ${res.status})`,
      statusCode: res.status,
    };
  }

  if (!res.ok) {
    log.warn({ statusCode: res.status, body: json }, 'Efipay rechazó el request');
    const errorMsg = extraerMensajeError(json) ?? `HTTP ${res.status}`;
    return { ok: false, error: errorMsg, statusCode: res.status };
  }

  const parsed = EfipayGeneratePaymentResponseSchema.safeParse(json);
  if (!parsed.success) {
    log.error(
      { issues: parsed.error.issues, body: json },
      'Efipay devolvió response que no matchea schema esperado',
    );
    return {
      ok: false,
      error: 'Respuesta de Efipay con formato inesperado — revisar logs.',
      statusCode: res.status,
    };
  }

  log.info({ paymentId: parsed.data.payment_id }, 'Efipay payment creado');
  return {
    ok: true,
    paymentId: parsed.data.payment_id,
    checkoutUrl: parsed.data.url,
    raw: parsed.data,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function construirBodyGeneratePayment(cfg: EfipayConfig, input: CrearPagoInput) {
  // Recortar/sanear los inputs según las reglas de Efipay
  const descripcion = input.descripcion.slice(0, 191);
  const referencias = input.referencias.slice(0, 3).map((r) => r.slice(0, 50));

  return {
    office: cfg.officeId,
    payment: {
      description: descripcion,
      amount: Math.round(input.monto * 100) / 100, // máx 2 decimales
      currency_type: 'COP',
      checkout_type: 'redirect',
    },
    advanced_options: {
      references: referencias,
      result_urls: {
        approved: `${cfg.returnUrlBase}/pago/efipay/exito`,
        rejected: `${cfg.returnUrlBase}/pago/efipay/rechazado`,
        pending: `${cfg.returnUrlBase}/pago/efipay/pendiente`,
        // Nota: la URL del webhook típicamente se configura en el dashboard
        // de Efipay — igual la mandamos por si la API la respeta.
        webhook: `${cfg.returnUrlBase}/api/efipay/webhook`,
      },
      payment_methods: {
        credit: true,
        pse: true,
        cash: true,
      },
    },
  };
}

function extraerMensajeError(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  // Efipay típicamente devuelve { message } o { error } o { errors: [...] }
  if (typeof b.message === 'string') return b.message;
  if (typeof b.error === 'string') return b.error;
  if (Array.isArray(b.errors) && b.errors.length > 0) {
    return b.errors
      .map((e) => (typeof e === 'string' ? e : (e as { message?: string }).message))
      .filter(Boolean)
      .join('; ');
  }
  return null;
}
