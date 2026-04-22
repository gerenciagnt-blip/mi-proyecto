-- CreateEnum
CREATE TYPE "FormaPagoTransaccion" AS ENUM ('POR_CONFIGURACION', 'CONSOLIDADO', 'POR_MEDIO_PAGO');

-- AlterTable
ALTER TABLE "comprobantes" ADD COLUMN     "fechaPago" TIMESTAMP(3),
ADD COLUMN     "formaPago" "FormaPagoTransaccion",
ADD COLUMN     "medioPagoId" TEXT,
ADD COLUMN     "numeroComprobanteExt" TEXT,
ADD COLUMN     "procesadoEn" TIMESTAMP(3),
ADD COLUMN     "totalAdmon" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalServicios" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalSgss" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "comprobantes_medioPagoId_idx" ON "comprobantes"("medioPagoId");

-- CreateIndex
CREATE INDEX "comprobantes_procesadoEn_idx" ON "comprobantes"("procesadoEn");

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_medioPagoId_fkey" FOREIGN KEY ("medioPagoId") REFERENCES "medios_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

