-- AlterTable
ALTER TABLE "afiliaciones" ADD COLUMN     "afpId" TEXT,
ADD COLUMN     "ccfId" TEXT,
ADD COLUMN     "comentarios" TEXT,
ADD COLUMN     "epsId" TEXT,
ADD COLUMN     "valorAdministracion" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "cotizantes" DROP COLUMN "ciudad",
DROP COLUMN "departamento",
ADD COLUMN     "departamentoId" TEXT,
ADD COLUMN     "fechaExpedicionDoc" TIMESTAMP(3),
ADD COLUMN     "municipioId" TEXT;

-- CreateTable
CREATE TABLE "afiliacion_servicios" (
    "afiliacionId" TEXT NOT NULL,
    "servicioAdicionalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "afiliacion_servicios_pkey" PRIMARY KEY ("afiliacionId","servicioAdicionalId")
);

-- CreateTable
CREATE TABLE "smlv_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "valor" DECIMAL(12,2) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smlv_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departamentos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "departamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipios" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "departamentoId" TEXT NOT NULL,

    CONSTRAINT "municipios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departamentos_codigo_key" ON "departamentos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "departamentos_nombre_key" ON "departamentos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "municipios_codigo_key" ON "municipios"("codigo");

-- CreateIndex
CREATE INDEX "municipios_departamentoId_idx" ON "municipios"("departamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "municipios_nombre_departamentoId_key" ON "municipios"("nombre", "departamentoId");

-- CreateIndex
CREATE INDEX "cotizantes_municipioId_idx" ON "cotizantes"("municipioId");

-- CreateIndex
CREATE INDEX "cotizantes_departamentoId_idx" ON "cotizantes"("departamentoId");

-- AddForeignKey
ALTER TABLE "cotizantes" ADD CONSTRAINT "cotizantes_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "municipios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizantes" ADD CONSTRAINT "cotizantes_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "departamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_epsId_fkey" FOREIGN KEY ("epsId") REFERENCES "entidades_sgss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_afpId_fkey" FOREIGN KEY ("afpId") REFERENCES "entidades_sgss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_ccfId_fkey" FOREIGN KEY ("ccfId") REFERENCES "entidades_sgss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliacion_servicios" ADD CONSTRAINT "afiliacion_servicios_afiliacionId_fkey" FOREIGN KEY ("afiliacionId") REFERENCES "afiliaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliacion_servicios" ADD CONSTRAINT "afiliacion_servicios_servicioAdicionalId_fkey" FOREIGN KEY ("servicioAdicionalId") REFERENCES "servicios_adicionales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipios" ADD CONSTRAINT "municipios_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "departamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

