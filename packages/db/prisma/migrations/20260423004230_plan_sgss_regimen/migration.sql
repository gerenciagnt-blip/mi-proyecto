-- CreateEnum
CREATE TYPE "RegimenPlan" AS ENUM ('ORDINARIO', 'RESOLUCION', 'AMBOS');

-- AlterTable
ALTER TABLE "planes_sgss" ADD COLUMN     "regimen" "RegimenPlan" NOT NULL DEFAULT 'AMBOS';

-- CreateIndex
CREATE INDEX "planes_sgss_regimen_idx" ON "planes_sgss"("regimen");
