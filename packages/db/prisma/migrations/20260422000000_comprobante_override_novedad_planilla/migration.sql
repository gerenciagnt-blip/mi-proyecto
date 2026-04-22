-- AlterTable
ALTER TABLE "comprobantes" ADD COLUMN     "aplicaNovedadRetiro" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "numeroPlanilla" TEXT,
ADD COLUMN     "valorAdminOverride" DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "comprobantes_numeroPlanilla_idx" ON "comprobantes"("numeroPlanilla");

