-- CreateEnum
CREATE TYPE "TipoPlanilla" AS ENUM ('E', 'I', 'Y', 'N', 'K', 'A', 'S');

-- CreateEnum
CREATE TYPE "EstadoPlanilla" AS ENUM ('CONSOLIDADO', 'PAGADA', 'ANULADA');

-- CreateTable
CREATE TABLE "planillas" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "tipoPlanilla" "TipoPlanilla" NOT NULL,
    "numeroPlanillaExt" TEXT,
    "empresaId" TEXT,
    "cotizanteId" TEXT,
    "periodoAporteAnio" INTEGER NOT NULL,
    "periodoAporteMes" INTEGER NOT NULL,
    "totalSalud" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPension" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalArl" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCcf" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalSena" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalIcbf" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalFsp" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalGeneral" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cantidadCotizantes" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoPlanilla" NOT NULL DEFAULT 'CONSOLIDADO',
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagadoEn" TIMESTAMP(3),
    "createdById" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planillas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planillas_comprobantes" (
    "planillaId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planillas_comprobantes_pkey" PRIMARY KEY ("planillaId","comprobanteId")
);

-- CreateIndex
CREATE UNIQUE INDEX "planillas_consecutivo_key" ON "planillas"("consecutivo");

-- CreateIndex
CREATE INDEX "planillas_periodoId_idx" ON "planillas"("periodoId");

-- CreateIndex
CREATE INDEX "planillas_estado_idx" ON "planillas"("estado");

-- CreateIndex
CREATE INDEX "planillas_tipoPlanilla_idx" ON "planillas"("tipoPlanilla");

-- CreateIndex
CREATE INDEX "planillas_empresaId_idx" ON "planillas"("empresaId");

-- CreateIndex
CREATE INDEX "planillas_cotizanteId_idx" ON "planillas"("cotizanteId");

-- CreateIndex
CREATE INDEX "planillas_periodoAporteAnio_periodoAporteMes_idx" ON "planillas"("periodoAporteAnio", "periodoAporteMes");

-- CreateIndex
CREATE UNIQUE INDEX "planillas_comprobantes_comprobanteId_key" ON "planillas_comprobantes"("comprobanteId");

-- CreateIndex
CREATE INDEX "planillas_comprobantes_comprobanteId_idx" ON "planillas_comprobantes"("comprobanteId");

-- AddForeignKey
ALTER TABLE "planillas" ADD CONSTRAINT "planillas_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos_contables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planillas" ADD CONSTRAINT "planillas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planillas" ADD CONSTRAINT "planillas_cotizanteId_fkey" FOREIGN KEY ("cotizanteId") REFERENCES "cotizantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planillas" ADD CONSTRAINT "planillas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planillas_comprobantes" ADD CONSTRAINT "planillas_comprobantes_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "planillas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planillas_comprobantes" ADD CONSTRAINT "planillas_comprobantes_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
