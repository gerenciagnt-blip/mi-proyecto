-- CreateEnum
CREATE TYPE "FormaPago" AS ENUM ('VIGENTE', 'VENCIDO');

-- CreateEnum
CREATE TYPE "TipoLiquidacion" AS ENUM ('VINCULACION', 'MENSUALIDAD');

-- DropIndex
DROP INDEX "liquidaciones_periodoId_afiliacionId_key";

-- AlterTable
ALTER TABLE "afiliaciones" ADD COLUMN     "formaPago" "FormaPago";

-- AlterTable
ALTER TABLE "liquidaciones" ADD COLUMN     "diaDesde" INTEGER,
ADD COLUMN     "diaHasta" INTEGER,
ADD COLUMN     "tipo" "TipoLiquidacion" NOT NULL DEFAULT 'MENSUALIDAD';

-- CreateIndex
CREATE INDEX "liquidaciones_tipo_idx" ON "liquidaciones"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "liquidaciones_periodoId_afiliacionId_tipo_key" ON "liquidaciones"("periodoId", "afiliacionId", "tipo");

