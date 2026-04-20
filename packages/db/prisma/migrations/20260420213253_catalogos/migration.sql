-- CreateEnum
CREATE TYPE "NivelRiesgo" AS ENUM ('I', 'II', 'III', 'IV', 'V');

-- CreateTable
CREATE TABLE "arls" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividades_economicas" (
    "id" TEXT NOT NULL,
    "codigoCiiu" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "nivelRiesgo" "NivelRiesgo",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actividades_economicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_cotizante" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipos_cotizante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtipos_cotizante" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoCotizanteId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subtipos_cotizante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arls_codigo_key" ON "arls"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "actividades_economicas_codigoCiiu_key" ON "actividades_economicas"("codigoCiiu");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_cotizante_codigo_key" ON "tipos_cotizante"("codigo");

-- CreateIndex
CREATE INDEX "subtipos_cotizante_tipoCotizanteId_idx" ON "subtipos_cotizante"("tipoCotizanteId");

-- CreateIndex
CREATE UNIQUE INDEX "subtipos_cotizante_codigo_tipoCotizanteId_key" ON "subtipos_cotizante"("codigo", "tipoCotizanteId");

-- AddForeignKey
ALTER TABLE "subtipos_cotizante" ADD CONSTRAINT "subtipos_cotizante_tipoCotizanteId_fkey" FOREIGN KEY ("tipoCotizanteId") REFERENCES "tipos_cotizante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
