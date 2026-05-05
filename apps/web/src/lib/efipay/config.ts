/**
 * Configuración de la integración Efipay — lee variables de entorno y
 * provee defaults sensatos.
 *
 * Variables esperadas en `.env`:
 *
 *   EFIPAY_BASE_URL       URL base de la API (default https://sag.efipay.co
 *                         — confirmado por probing 2026-05-05; el host
 *                         api.efipay.co NO existe aunque algunas docs lo
 *                         sugieran).
 *   EFIPAY_ACCESS_TOKEN   Bearer token para crear pagos (sandbox o prod)
 *   EFIPAY_WEBHOOK_TOKEN  Token de webhooks (para verificar firma HMAC-SHA256)
 *   EFIPAY_OFFICE_ID      ID de la oficina/sucursal en el dashboard Efipay
 *
 *   EFIPAY_RETURN_URL_BASE URL base donde el NAVEGADOR del aliado vuelve
 *                          después de pagar (result_urls.approved/rejected/
 *                          pending). El navegador es el del usuario, así que
 *                          en dev local puede ser http://localhost:3000.
 *                          En prod: https://app.sistema-pila.co.
 *                          Sin trailing slash.
 *
 *   EFIPAY_WEBHOOK_URL    URL completa que Efipay (su servidor) llama para
 *                          notificar el resultado. SIEMPRE debe ser pública
 *                          — Efipay no puede llegar a localhost. En dev
 *                          usar ngrok/cloudflared. En prod: la misma del
 *                          RETURN_URL_BASE + /api/efipay/webhook.
 *                          Si no está seteada, se construye desde
 *                          RETURN_URL_BASE (asume que es pública).
 *
 * NOTA OPERATIVA: separar las dos URLs permite probar localmente sin
 * túnel — el redirect del navegador funciona contra localhost mientras
 * el webhook se desactiva (o apunta a ngrok solo cuando se quiere probar
 * end-to-end con confirmación automática del cobro).
 */

export type EfipayConfig = {
  baseUrl: string;
  accessToken: string;
  webhookToken: string;
  officeId: string;
  returnUrlBase: string;
  /** URL absoluta del webhook que enviamos a Efipay (puede diferir de returnUrlBase). */
  webhookUrl: string;
};

/**
 * Obtiene la configuración. Falla loud si falta algo en runtime — para
 * que el operador vea el error claro al iniciar pago, no al deploy.
 */
export function getEfipayConfig(): EfipayConfig {
  const baseUrl = (process.env.EFIPAY_BASE_URL ?? 'https://sag.efipay.co').replace(/\/+$/, '');
  const accessToken = process.env.EFIPAY_ACCESS_TOKEN ?? '';
  const webhookToken = process.env.EFIPAY_WEBHOOK_TOKEN ?? '';
  const officeId = process.env.EFIPAY_OFFICE_ID ?? '';

  const returnUrlBase = (
    process.env.EFIPAY_RETURN_URL_BASE ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000'
  ).replace(/\/+$/, '');

  // Webhook URL: si EFIPAY_WEBHOOK_URL está seteada, se usa tal cual.
  // Si no, se deriva de RETURN_URL_BASE. Permite que en dev local el
  // navegador use localhost y el webhook ngrok sin tener que cambiar
  // el RETURN_URL_BASE cada vez.
  const webhookUrl = (
    process.env.EFIPAY_WEBHOOK_URL ?? `${returnUrlBase}/api/efipay/webhook`
  ).replace(/\/+$/, '');

  return { baseUrl, accessToken, webhookToken, officeId, returnUrlBase, webhookUrl };
}

/**
 * Valida que la config esté completa para CREAR pagos. Devuelve null si
 * todo OK o un mensaje de error si falta algo. Usar antes de invocar el
 * client.
 */
export function validateEfipayConfig(c: EfipayConfig): string | null {
  if (!c.accessToken) return 'EFIPAY_ACCESS_TOKEN no está configurado';
  if (!c.officeId) return 'EFIPAY_OFFICE_ID no está configurado';
  if (!c.returnUrlBase) return 'EFIPAY_RETURN_URL_BASE (o NEXTAUTH_URL) no está configurado';
  return null;
}

/**
 * Valida que la config esté completa para VERIFICAR webhooks (subset
 * mínimo). El webhook puede llegar incluso si el access token no está,
 * pero NO lo procesamos sin webhook token.
 */
export function validateEfipayWebhookConfig(c: EfipayConfig): string | null {
  if (!c.webhookToken) return 'EFIPAY_WEBHOOK_TOKEN no está configurado';
  return null;
}
