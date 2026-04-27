-- Sprint Soporte reorg fase 2 — un cotizante puede tener máximo dos
-- afiliaciones: una DEPENDIENTE y una INDEPENDIENTE. Si vuelve a entrar
-- después de inactivarse, se REACTIVA el registro existente; nunca se
-- crea uno duplicado.
--
-- Pre-verificación (corrió antes de aplicar): 0 grupos con duplicados.

-- CreateIndex
CREATE UNIQUE INDEX "afiliaciones_cotizanteId_modalidad_key" ON "afiliaciones"("cotizanteId", "modalidad");
