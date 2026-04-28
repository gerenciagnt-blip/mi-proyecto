-- CreateIndex
CREATE INDEX "cartera_detallado_sucursalAsignadaId_estado_updatedAt_idx" ON "cartera_detallado"("sucursalAsignadaId", "estado", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "incapacidades_sucursalId_estado_fechaRadicacion_idx" ON "incapacidades"("sucursalId", "estado", "fechaRadicacion" DESC);

-- CreateIndex
CREATE INDEX "liquidaciones_afiliacionId_estado_idx" ON "liquidaciones"("afiliacionId", "estado");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_estado_fechaRadicacion_idx" ON "soporte_afiliacion"("estado", "fechaRadicacion" DESC);

-- CreateIndex
CREATE INDEX "soporte_afiliacion_asignadoAUserId_estado_idx" ON "soporte_afiliacion"("asignadoAUserId", "estado");
