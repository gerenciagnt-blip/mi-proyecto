/**
 * Webhook Efipay — recibe notificaciones de cambio de estado de las
 * transacciones que iniciamos via `crearPagoEfipay`.
 *
 * Doc: https://efipay.co/docs/1.0/webhook-transaction
 *
 * Reglas:
 *   - Endpoint POST público (no requiere sesión).
 *   - VERIFICA firma HMAC-SHA256 con `EFIPAY_WEBHOOK_TOKEN` antes de
 *     procesar nada. Sin firma válida → 401 sin tocar BD.
 *   - Idempotente: si llega el mismo webhook 2 veces (Efipay reintenta
 *     a 10s y 100s si no respondemos 2xx), no duplicamos efectos.
 *   - Si el status es APROBADA, marca el `CobroAliado` como PAGADO y
 *     guarda referencia.
 *
 * Status devueltos:
 *   200 — procesado correctamente (Efipay no reintenta)
 *   401 — firma inválida (Efipay sí reintenta, pero seguirán fallando)
 *   400 — payload malformado (Efipay reintenta)
 *   500 — error interno (Efipay reintenta)
 */

import { NextResponse } from 'next/server';
import type { EfipayEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { auditarEvento } from '@/lib/auditoria';
import { createLogger } from '@/lib/logger';
import { getEfipayConfig, validateEfipayWebhookConfig } from '@/lib/efipay/config';
import { verificarFirmaWebhook } from '@/lib/efipay/firma';
import {
  EfipayWebhookPayloadSchema,
  mapEfipayStatus,
  type EfipayWebhookPayload,
} from '@/lib/efipay/validations';

const log = createLogger('efipay-webhook');

export const dynamic = 'force-dynamic'; // nunca cachear

export async function POST(request: Request) {
  const cfg = getEfipayConfig();
  const cfgError = validateEfipayWebhookConfig(cfg);
  if (cfgError) {
    log.error({ cfgError }, 'Webhook llegó pero config no está lista');
    return new NextResponse('Webhook not configured', { status: 503 });
  }

  // 1. Leer body CRUDO — necesario para HMAC. No usar request.json() antes.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    log.warn({ err: String(err) }, 'No se pudo leer body del webhook');
    return new NextResponse('Bad request', { status: 400 });
  }

  // 2. Verificar firma
  const signature = request.headers.get('signature') ?? request.headers.get('Signature');
  const firmaOk = verificarFirmaWebhook(rawBody, signature, cfg.webhookToken);
  if (!firmaOk) {
    log.warn(
      { hasSignature: !!signature, bodyLen: rawBody.length },
      'Webhook con firma inválida — rechazado',
    );
    return new NextResponse('Invalid signature', { status: 401 });
  }

  // 3. Parsear JSON
  let parsed: EfipayWebhookPayload;
  try {
    const json = JSON.parse(rawBody);
    const result = EfipayWebhookPayloadSchema.safeParse(json);
    if (!result.success) {
      log.warn(
        { issues: result.error.issues, body: json },
        'Webhook payload no matchea schema — sigue procesando con campos disponibles',
      );
      // Intento best-effort si al menos viene transaction.status
      if (typeof json?.transaction?.status === 'string') {
        parsed = json as EfipayWebhookPayload;
      } else {
        return new NextResponse('Payload schema invalid', { status: 400 });
      }
    } else {
      parsed = result.data;
    }
  } catch (err) {
    log.warn({ err: String(err) }, 'Webhook con JSON inválido');
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // 4. Localizar la transacción — primero por payment_id (la fuente de
  //    verdad de Efipay), si no por referencia (consecutivo).
  const paymentId = parsed.checkout?.payment_id ?? String(parsed.transaction.id ?? '');
  const referencia = parsed.checkout?.references?.[0];

  let trx = paymentId
    ? await prisma.efipayTransaccion.findFirst({
        where: { efipayPaymentId: paymentId },
        select: { id: true, estado: true, cobroAliadoId: true, intentosWebhook: true },
        orderBy: { iniciadaEn: 'desc' },
      })
    : null;
  if (!trx && referencia) {
    trx = await prisma.efipayTransaccion.findFirst({
      where: { referencia, estado: 'PENDIENTE' },
      select: { id: true, estado: true, cobroAliadoId: true, intentosWebhook: true },
      orderBy: { iniciadaEn: 'desc' },
    });
  }

  if (!trx) {
    log.warn(
      { paymentId, referencia, status: parsed.transaction.status },
      'Webhook recibido pero no encontramos EfipayTransaccion — posiblemente test o trx ajena',
    );
    // Devolvemos 200 igual para que Efipay no reintente algo que no es nuestro
    return NextResponse.json({ ok: true, message: 'transaction not found, ignored' });
  }

  // 5. Mapear estado
  const nuevoEstado = mapEfipayStatus(parsed.transaction.status);
  const motivo =
    (parsed.transaction as { reason?: string; message?: string }).reason ??
    (parsed.transaction as { reason?: string; message?: string }).message ??
    null;

  // 6. Idempotencia: si ya estaba en estado terminal Y nos llega lo mismo,
  //    solo incrementamos intentosWebhook y guardamos payload. NO volvemos
  //    a marcar el cobro como pagado.
  const yaTerminal = trx.estado === 'APROBADA' || trx.estado === 'RECHAZADA';
  if (yaTerminal && trx.estado === nuevoEstado) {
    await prisma.efipayTransaccion.update({
      where: { id: trx.id },
      data: {
        webhookPayload: parsed as object,
        webhookRecibidoEn: new Date(),
        intentosWebhook: { increment: 1 },
      },
    });
    log.info(
      { trxId: trx.id, estado: nuevoEstado },
      'Webhook duplicado en estado terminal — ignorado idempotentemente',
    );
    return NextResponse.json({ ok: true, message: 'already processed' });
  }

  // 7. Procesar el cambio dentro de transacción atómica
  const ahora = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.efipayTransaccion.update({
      where: { id: trx.id },
      data: {
        estado: nuevoEstado as EfipayEstado,
        motivo: motivo?.slice(0, 500) ?? null,
        webhookPayload: parsed as object,
        webhookRecibidoEn: ahora,
        intentosWebhook: { increment: 1 },
        aprobadaEn: nuevoEstado === 'APROBADA' ? ahora : undefined,
        rechazadaEn: nuevoEstado === 'RECHAZADA' ? ahora : undefined,
        expiradaEn: nuevoEstado === 'EXPIRADA' ? ahora : undefined,
      },
    });

    // Si APROBADA, marcamos el CobroAliado como PAGADO
    if (nuevoEstado === 'APROBADA') {
      await tx.cobroAliado.update({
        where: { id: trx.cobroAliadoId },
        data: {
          estado: 'PAGADO',
          fechaPagado: ahora,
          referenciaPago: paymentId ? `EFIPAY:${paymentId}` : `EFIPAY:${trx.id}`,
        },
      });
    }
  });

  // 8. Auditar fuera de la transacción
  if (nuevoEstado === 'APROBADA' || nuevoEstado === 'RECHAZADA') {
    await auditarEvento({
      entidad: 'CobroAliado',
      entidadId: trx.cobroAliadoId,
      accion: nuevoEstado === 'APROBADA' ? 'PAGO_EFIPAY_APROBADO' : 'PAGO_EFIPAY_RECHAZADO',
      descripcion:
        nuevoEstado === 'APROBADA'
          ? `Pago Efipay aprobado · payment_id=${paymentId}`
          : `Pago Efipay rechazado · ${motivo ?? 'sin motivo'}`,
      cambios:
        nuevoEstado === 'APROBADA'
          ? { antes: { estado: 'PENDIENTE' }, despues: { estado: 'PAGADO' }, campos: ['estado'] }
          : null,
    });
  }

  log.info(
    { trxId: trx.id, paymentId, nuevoEstado, cobroAliadoId: trx.cobroAliadoId },
    'Webhook Efipay procesado',
  );

  return NextResponse.json({ ok: true });
}

// Bloquear otros métodos
export async function GET() {
  return new NextResponse('Method not allowed', { status: 405 });
}
