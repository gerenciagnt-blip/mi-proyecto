-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('AFILIACION', 'MENSUALIDAD');

-- CreateEnum
CREATE TYPE "AgrupacionComprobante" AS ENUM ('INDIVIDUAL', 'EMPRESA_CC', 'ASESOR_COMERCIAL');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('BORRADOR', 'EMITIDO', 'PAGADO', 'ANULADO');

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "tipo" "TipoComprobante" NOT NULL,
    "agrupacion" "AgrupacionComprobante" NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "cotizanteId" TEXT,
    "cuentaCobroId" TEXT,
    "asesorComercialId" TEXT,
    "totalEmpleador" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalTrabajador" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalGeneral" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "emitidoEn" TIMESTAMP(3),
    "pagadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobante_liquidaciones" (
    "comprobanteId" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,

    CONSTRAINT "comprobante_liquidaciones_pkey" PRIMARY KEY ("comprobanteId","liquidacionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_consecutivo_key" ON "comprobantes"("consecutivo");

-- CreateIndex
CREATE INDEX "comprobantes_periodoId_idx" ON "comprobantes"("periodoId");

-- CreateIndex
CREATE INDEX "comprobantes_estado_idx" ON "comprobantes"("estado");

-- CreateIndex
CREATE INDEX "comprobantes_tipo_agrupacion_idx" ON "comprobantes"("tipo", "agrupacion");

-- CreateIndex
CREATE INDEX "comprobantes_cotizanteId_idx" ON "comprobantes"("cotizanteId");

-- CreateIndex
CREATE INDEX "comprobantes_cuentaCobroId_idx" ON "comprobantes"("cuentaCobroId");

-- CreateIndex
CREATE INDEX "comprobantes_asesorComercialId_idx" ON "comprobantes"("asesorComercialId");

-- CreateIndex
CREATE INDEX "comprobante_liquidaciones_liquidacionId_idx" ON "comprobante_liquidaciones"("liquidacionId");

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos_contables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_cotizanteId_fkey" FOREIGN KEY ("cotizanteId") REFERENCES "cotizantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_cuentaCobroId_fkey" FOREIGN KEY ("cuentaCobroId") REFERENCES "cuentas_cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_asesorComercialId_fkey" FOREIGN KEY ("asesorComercialId") REFERENCES "asesores_comerciales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_liquidaciones" ADD CONSTRAINT "comprobante_liquidaciones_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_liquidaciones" ADD CONSTRAINT "comprobante_liquidaciones_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "liquidaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

