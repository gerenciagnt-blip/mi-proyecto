-- CreateEnum
CREATE TYPE "EfipayEstado" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'EXPIRADA', 'ERROR');

-- CreateTable
CREATE TABLE "efipay_transaccion" (
    "id" TEXT NOT NULL,
    "cobroAliadoId" TEXT NOT NULL,
    "efipayPaymentId" TEXT,
    "referencia" TEXT NOT NULL,
    "montoBase" DECIMAL(12,2) NOT NULL,
    "sobrecosto" DECIMAL(12,2) NOT NULL,
    "montoCobrado" DECIMAL(12,2) NOT NULL,
    "urlCheckout" TEXT,
    "estado" "EfipayEstado" NOT NULL DEFAULT 'PENDIENTE',
    "motivo" TEXT,
    "webhookPayload" JSONB,
    "webhookRecibidoEn" TIMESTAMP(3),
    "intentosWebhook" INTEGER NOT NULL DEFAULT 0,
    "iniciadaPorId" TEXT,
    "iniciadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprobadaEn" TIMESTAMP(3),
    "rechazadaEn" TIMESTAMP(3),
    "expiradaEn" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "efipay_transaccion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "efipay_transaccion_efipayPaymentId_key" ON "efipay_transaccion"("efipayPaymentId");

-- CreateIndex
CREATE INDEX "efipay_transaccion_cobroAliadoId_idx" ON "efipay_transaccion"("cobroAliadoId");

-- CreateIndex
CREATE INDEX "efipay_transaccion_estado_idx" ON "efipay_transaccion"("estado");

-- CreateIndex
CREATE INDEX "efipay_transaccion_referencia_idx" ON "efipay_transaccion"("referencia");

-- AddForeignKey
ALTER TABLE "efipay_transaccion" ADD CONSTRAINT "efipay_transaccion_cobroAliadoId_fkey" FOREIGN KEY ("cobroAliadoId") REFERENCES "cobro_aliado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "efipay_transaccion" ADD CONSTRAINT "efipay_transaccion_iniciadaPorId_fkey" FOREIGN KEY ("iniciadaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
