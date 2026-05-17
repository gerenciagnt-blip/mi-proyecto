-- CreateIndex
CREATE INDEX "afiliaciones_asesorComercialId_modalidad_idx" ON "afiliaciones"("asesorComercialId", "modalidad");

-- CreateIndex
CREATE INDEX "afiliaciones_asesorComercialId_fechaRetiro_idx" ON "afiliaciones"("asesorComercialId", "fechaRetiro");

-- CreateIndex
CREATE INDEX "comprobantes_periodoId_estado_idx" ON "comprobantes"("periodoId", "estado");

-- CreateIndex
CREATE INDEX "mensajes_conversacionId_autorId_createdAt_idx" ON "mensajes"("conversacionId", "autorId", "createdAt");
