-- CreateEnum
CREATE TYPE "Regimen" AS ENUM ('ORDINARIO', 'RESOLUCION');

-- AlterTable
ALTER TABLE "afiliaciones" ADD COLUMN     "actividadEconomicaId" TEXT,
ADD COLUMN     "planSgssId" TEXT,
ADD COLUMN     "regimen" "Regimen" NOT NULL DEFAULT 'ORDINARIO';

-- CreateTable
CREATE TABLE "planes_sgss" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "incluyeEps" BOOLEAN NOT NULL DEFAULT false,
    "incluyeAfp" BOOLEAN NOT NULL DEFAULT false,
    "incluyeArl" BOOLEAN NOT NULL DEFAULT false,
    "incluyeCcf" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planes_sgss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planes_sgss_codigo_key" ON "planes_sgss"("codigo");

-- CreateIndex
CREATE INDEX "afiliaciones_actividadEconomicaId_idx" ON "afiliaciones"("actividadEconomicaId");

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_planSgssId_fkey" FOREIGN KEY ("planSgssId") REFERENCES "planes_sgss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_actividadEconomicaId_fkey" FOREIGN KEY ("actividadEconomicaId") REFERENCES "actividades_economicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

