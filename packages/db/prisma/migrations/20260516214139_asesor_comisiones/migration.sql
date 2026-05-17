-- CreateEnum
CREATE TYPE "EstadoComisionAsesor" AS ENUM ('ABIERTA', 'CERRADA');

-- AlterTable
ALTER TABLE "asesores_comerciales" ADD COLUMN     "generaComision" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metaMensual" DECIMAL(15,2);

-- CreateTable
CREATE TABLE "comisiones_asesor" (
    "id" TEXT NOT NULL,
    "asesorId" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "meta" DECIMAL(15,2) NOT NULL,
    "valorAfiliacionesNuevas" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cumplimientoMeta" BOOLEAN NOT NULL DEFAULT false,
    "afiliacionesIndependientes" INTEGER NOT NULL DEFAULT 0,
    "cumplimientoIndependientes" BOOLEAN NOT NULL DEFAULT false,
    "porcentajeRetiros" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cumplimientoRetiros" BOOLEAN NOT NULL DEFAULT false,
    "cumpleLas3" BOOLEAN NOT NULL DEFAULT false,
    "porcentajeAplicado" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "valorComision" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "estado" "EstadoComisionAsesor" NOT NULL DEFAULT 'CERRADA',
    "cerradaPorUserId" TEXT,
    "cerradaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comisiones_asesor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comisiones_asesor_periodoId_idx" ON "comisiones_asesor"("periodoId");

-- CreateIndex
CREATE INDEX "comisiones_asesor_asesorId_periodoId_idx" ON "comisiones_asesor"("asesorId", "periodoId");

-- CreateIndex
CREATE UNIQUE INDEX "comisiones_asesor_asesorId_periodoId_key" ON "comisiones_asesor"("asesorId", "periodoId");

-- AddForeignKey
ALTER TABLE "comisiones_asesor" ADD CONSTRAINT "comisiones_asesor_asesorId_fkey" FOREIGN KEY ("asesorId") REFERENCES "asesores_comerciales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones_asesor" ADD CONSTRAINT "comisiones_asesor_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos_contables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones_asesor" ADD CONSTRAINT "comisiones_asesor_cerradaPorUserId_fkey" FOREIGN KEY ("cerradaPorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
