-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "arlId" TEXT;

-- CreateTable
CREATE TABLE "empresa_nivel_riesgo" (
    "empresaId" TEXT NOT NULL,
    "nivel" "NivelRiesgo" NOT NULL,

    CONSTRAINT "empresa_nivel_riesgo_pkey" PRIMARY KEY ("empresaId","nivel")
);

-- CreateTable
CREATE TABLE "empresa_actividad" (
    "empresaId" TEXT NOT NULL,
    "actividadEconomicaId" TEXT NOT NULL,

    CONSTRAINT "empresa_actividad_pkey" PRIMARY KEY ("empresaId","actividadEconomicaId")
);

-- CreateTable
CREATE TABLE "empresa_tipo_cotizante" (
    "empresaId" TEXT NOT NULL,
    "tipoCotizanteId" TEXT NOT NULL,

    CONSTRAINT "empresa_tipo_cotizante_pkey" PRIMARY KEY ("empresaId","tipoCotizanteId")
);

-- CreateTable
CREATE TABLE "empresa_subtipo_cotizante" (
    "empresaId" TEXT NOT NULL,
    "subtipoId" TEXT NOT NULL,

    CONSTRAINT "empresa_subtipo_cotizante_pkey" PRIMARY KEY ("empresaId","subtipoId")
);

-- CreateIndex
CREATE INDEX "empresas_arlId_idx" ON "empresas"("arlId");

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_arlId_fkey" FOREIGN KEY ("arlId") REFERENCES "arls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_nivel_riesgo" ADD CONSTRAINT "empresa_nivel_riesgo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_actividad" ADD CONSTRAINT "empresa_actividad_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_actividad" ADD CONSTRAINT "empresa_actividad_actividadEconomicaId_fkey" FOREIGN KEY ("actividadEconomicaId") REFERENCES "actividades_economicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_tipo_cotizante" ADD CONSTRAINT "empresa_tipo_cotizante_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_tipo_cotizante" ADD CONSTRAINT "empresa_tipo_cotizante_tipoCotizanteId_fkey" FOREIGN KEY ("tipoCotizanteId") REFERENCES "tipos_cotizante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_subtipo_cotizante" ADD CONSTRAINT "empresa_subtipo_cotizante_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_subtipo_cotizante" ADD CONSTRAINT "empresa_subtipo_cotizante_subtipoId_fkey" FOREIGN KEY ("subtipoId") REFERENCES "subtipos_cotizante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

