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

  const url = `${cfg.baseUrl}/api/v1/payment/generate-payment`;
  let res: Response;
  try {
    res = await fetch(url, {
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
    // Undici/fetch envuelve el error real en `cause` ({ code: 'ENOTFOUND', ... }
    // para DNS, 'ECONNREFUSED' para conexión, 'CERT_*' para TLS). Loggeamos
    // todo el árbol para que el operador identifique el problema rápido.
    const detalle = serializarErrorFetch(err);
    log.error({ url, ...detalle }, 'Efipay generate-payment falló a nivel red');
    return {
      ok: false,
      error: `Error de red al contactar Efipay (${detalle.code ?? detalle.message}). Verifica EFIPAY_BASE_URL en .env.`,
    };
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
    // 422 (validación) y 400 son errores DEL BODY que enviamos. Loggeamos
    // el body enviado (sin office/credenciales) + el response completo de
    // Efipay para que el dev pueda corregir el payload sin adivinar.
    log.warn(
      {
        statusCode: res.status,
        responseBody: json,
        sentPayment: body.payment,
        sentReferences: body.advanced_options.references,
        sentResultUrls: body.advanced_options.result_urls,
      },
      'Efipay rechazó el request',
    );
    const errorMsg = extraerMensajeError(json) ?? `HTTP ${res.status}`;
    // En dev incluimos el body de error en el mensaje para que sea visible
    // en la UI sin tener que mirar logs del server.
    const dev = process.env.NODE_ENV !== 'production';
    const errorWithDetail = dev
      ? `${errorMsg} · respuesta cruda: ${JSON.stringify(json).slice(0, 500)}`
      : errorMsg;
    return { ok: false, error: errorWithDetail, statusCode: res.status };
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
        // Result URLs las visita el NAVEGADOR del aliado → en dev local
        // pueden apuntar a localhost (no necesitan ser públicas).
        approved: `${cfg.returnUrlBase}/pago/efipay/exito`,
        rejected: `${cfg.returnUrlBase}/pago/efipay/rechazado`,
        pending: `${cfg.returnUrlBase}/pago/efipay/pendiente`,
        // Webhook URL la llama el SERVIDOR de Efipay → debe ser pública
        // (en dev: ngrok). Por eso vive en su propia env var EFIPAY_WEBHOOK_URL.
        // Nota: la doc de Efipay dice que la URL del webhook típicamente se
        // configura en el dashboard — la mandamos también por si la API la
        // respeta.
        webhook: cfg.webhookUrl,
      },
      // OMITIDO: payment_methods. La doc de Efipay devolvió 422 indicando
      // que "credit/pse/cash" deben ser ARRAYS de gateways, no booleanos.
      // Sin la doc exacta de qué gateways soporta cada comercio, lo más
      // seguro es no enviar el campo — Efipay usa el default del comercio
      // (todos los métodos configurados en el dashboard).
    },
  };
}

/**
 * Serializa un error de fetch para logueo: pino normalmente solo muestra
 * `message` y oculta el `cause` que tiene el detalle real (ENOTFOUND,
 * ECONNREFUSED, CERT_*, etc.). Esto extrae el árbol completo.
 */
function serializarErrorFetch(err: unknown): { message: string; code?: string; cause?: string } {
  if (!(err instanceof Error)) {
    return { message: String(err) };
  }
  // El cause de undici es un Error con propiedades adicionales (code, errno).
  const cause = (err as { cause?: unknown }).cause;
  let causeStr: string | undefined;
  let code: string | undefined;
  if (cause instanceof Error) {
    code = (cause as { code?: string }).code;
    causeStr = `${cause.name}: ${cause.message}${code ? ` (${code})` : ''}`;
  } else if (cause !== undefined && cause !== null) {
    causeStr = String(cause);
  }
  return {
    message: err.message,
    ...(code ? { code } : {}),
    ...(causeStr ? { cause: causeStr } : {}),
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
