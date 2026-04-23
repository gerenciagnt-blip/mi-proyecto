-- Scoping por sucursal para Cotizante y Planilla.
-- Los registros existentes quedan con sucursalId=NULL (legados).
-- El admin puede reasignarlos desde la UI.

-- ========== Cotizante ==========
ALTER TABLE "cotizantes" ADD COLUMN "sucursalId" TEXT;

-- Drop unique (tipoDocumento, numeroDocumento) y reemplaza por el compuesto
-- con sucursalId para permitir que la misma persona exista en varias
-- sucursales (cada aliado lleva sus propios registros).
DROP INDEX IF EXISTS "cotizantes_tipoDocumento_numeroDocumento_key";

CREATE UNIQUE INDEX "cotizantes_sucursalId_tipoDocumento_numeroDocumento_key"
  ON "cotizantes"("sucursalId", "tipoDocumento", "numeroDocumento");
CREATE INDEX "cotizantes_sucursalId_idx"
  ON "cotizantes"("sucursalId");

ALTER TABLE "cotizantes"
  ADD CONSTRAINT "cotizantes_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ========== Planilla ==========
ALTER TABLE "planillas" ADD COLUMN "sucursalId" TEXT;

CREATE INDEX "planillas_sucursalId_idx"
  ON "planillas"("sucursalId");

ALTER TABLE "planillas"
  ADD CONSTRAINT "planillas_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
