-- CreateTable
CREATE TABLE "cargos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "actividadEconomicaId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asesores_comerciales" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asesores_comerciales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medios_pago" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medios_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios_adicionales" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicios_adicionales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cargos_codigo_key" ON "cargos"("codigo");

-- CreateIndex
CREATE INDEX "cargos_actividadEconomicaId_idx" ON "cargos"("actividadEconomicaId");

-- CreateIndex
CREATE UNIQUE INDEX "asesores_comerciales_codigo_key" ON "asesores_comerciales"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "medios_pago_codigo_key" ON "medios_pago"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "servicios_adicionales_codigo_key" ON "servicios_adicionales"("codigo");

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_actividadEconomicaId_fkey" FOREIGN KEY ("actividadEconomicaId") REFERENCES "actividades_economicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

