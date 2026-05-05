/**
 * Endpoint de diagnóstico para integración Efipay. Solo staff.
 *
 * Lista las últimas 20 EfipayTransaccion con su estado, payload de
 * webhook recibido (si lo hubo), motivo de error, y la configuración
 * actual (sin secretos). Útil cuando un pago se aprobó en Efipay pero
 * el cobro sigue PENDIENTE — permite ver si el webhook nunca llegó,
 * llegó pero falló la firma, o se procesó pero el status no se mapeó.
 *
 * NO se devuelven access tokens ni webhook tokens — solo si están
 * presentes (boolean) y la URL configurada.
 *
 * GET /api/admin/efipay-debug
 */

import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { getEfipayConfig } from '@/lib/efipay/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireStaff();

  const cfg = getEfipayConfig();

  const trxs = await prisma.efipayTransaccion.findMany({
    orderBy: { iniciadaEn: 'desc' },
    take: 20,
    select: {
      id: true,
      cobroAliadoId: true,
      efipayPaymentId: true,
      referencia: true,
      montoBase: true,
      sobrecosto: true,
      montoCobrado: true,
      estado: true,
      motivo: true,
      webhookPayload: true,
      webhookRecibidoEn: true,
      intentosWebhook: true,
      iniciadaEn: true,
      aprobadaEn: true,
      rechazadaEn: true,
      cobro: {
        select: {
          consecutivo: true,
          estado: true,
          fechaPagado: true,
          referenciaPago: true,
          sucursal: { select: { codigo: true, nombre: true } },
        },
      },
    },
  });

  return NextResponse.json(
    {
      config: {
        baseUrl: cfg.baseUrl,
        accessTokenSet: cfg.accessToken.length > 0,
        accessTokenLength: cfg.accessToken.length,
        webhookTokenSet: cfg.webhookToken.length > 0,
        webhookTokenLength: cfg.webhookToken.length,
        officeIdSet: cfg.officeId.length > 0,
        officeIdLength: cfg.officeId.length,
        returnUrlBase: cfg.returnUrlBase,
        webhookUrl: cfg.webhookUrl,
      },
      diagnostico: {
        totalTransacciones: trxs.length,
        pendientes: trxs.filter((t) => t.estado === 'PENDIENTE').length,
        aprobadas: trxs.filter((t) => t.estado === 'APROBADA').length,
        rechazadas: trxs.filter((t) => t.estado === 'RECHAZADA').length,
        errores: trxs.filter((t) => t.estado === 'ERROR').length,
        webhooksRecibidos: trxs.filter((t) => t.webhookRecibidoEn !== null).length,
      },
      transacciones: trxs.map((t) => ({
        id: t.id,
        referencia: t.referencia,
        consecutivoCobro: t.cobro.consecutivo,
        sucursal: `${t.cobro.sucursal.codigo} · ${t.cobro.sucursal.nombre}`,
        estadoTrx: t.estado,
        estadoCobro: t.cobro.estado,
        montoBase: Number(t.montoBase),
        sobrecosto: Number(t.sobrecosto),
        montoCobrado: Number(t.montoCobrado),
        efipayPaymentId: t.efipayPaymentId,
        iniciadaEn: t.iniciadaEn.toISOString(),
        aprobadaEn: t.aprobadaEn?.toISOString() ?? null,
        rechazadaEn: t.rechazadaEn?.toISOString() ?? null,
        webhookRecibidoEn: t.webhookRecibidoEn?.toISOString() ?? null,
        intentosWebhook: t.intentosWebhook,
        motivo: t.motivo,
        webhookPayload: t.webhookPayload, // útil para ver qué status mandó Efipay
      })),
    },
    { status: 200 },
  );
}
