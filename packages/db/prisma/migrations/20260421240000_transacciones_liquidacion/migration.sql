-- CreateEnum
CREATE TYPE "EstadoPeriodo" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('BORRADOR', 'REVISADA', 'PAGADA', 'ANULADA');

-- CreateTable
CREATE TABLE "periodos_contables" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "estado" "EstadoPeriodo" NOT NULL DEFAULT 'ABIERTO',
    "smlvSnapshot" DECIMAL(12,2) NOT NULL,
    "observaciones" TEXT,
    "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periodos_contables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "afiliacionId" TEXT NOT NULL,
    "ibc" DECIMAL(12,2) NOT NULL,
    "diasCotizados" INTEGER NOT NULL DEFAULT 30,
    "totalEmpleador" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalTrabajador" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalGeneral" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "calculadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidacion_conceptos" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "subconcepto" TEXT,
    "base" DECIMAL(12,2) NOT NULL,
    "porcentaje" DECIMAL(6,4) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "aCargoEmpleador" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidacion_conceptos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "periodos_contables_estado_idx" ON "periodos_contables"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "periodos_contables_anio_mes_key" ON "periodos_contables"("anio", "mes");

-- CreateIndex
CREATE INDEX "liquidaciones_periodoId_idx" ON "liquidaciones"("periodoId");

-- CreateIndex
CREATE INDEX "liquidaciones_afiliacionId_idx" ON "liquidaciones"("afiliacionId");

-- CreateIndex
CREATE INDEX "liquidaciones_estado_idx" ON "liquidaciones"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "liquidaciones_periodoId_afiliacionId_key" ON "liquidaciones"("periodoId", "afiliacionId");

-- CreateIndex
CREATE INDEX "liquidacion_conceptos_liquidacionId_idx" ON "liquidacion_conceptos"("liquidacionId");

-- CreateIndex
CREATE INDEX "liquidacion_conceptos_concepto_idx" ON "liquidacion_conceptos"("concepto");

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos_contables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_afiliacionId_fkey" FOREIGN KEY ("afiliacionId") REFERENCES "afiliaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_conceptos" ADD CONSTRAINT "liquidacion_conceptos_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "liquidaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

