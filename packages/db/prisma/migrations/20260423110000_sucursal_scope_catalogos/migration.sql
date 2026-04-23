-- Scoping por sucursal: agrega sucursalId nullable a 3 catalogos.
-- Los registros existentes quedan con sucursalId=NULL (modo "global").
-- El admin puede reasignarlos a sucursales especificas desde la UI.
-- sucursalId NULL = visible por todas las sucursales (solo CRUD staff).

-- ========== AsesorComercial ==========
ALTER TABLE "asesores_comerciales" ADD COLUMN "sucursalId" TEXT;

-- Drop unique simple de codigo y reemplaza por compuesto
DROP INDEX IF EXISTS "asesores_comerciales_codigo_key";

CREATE UNIQUE INDEX "asesores_comerciales_sucursalId_codigo_key"
  ON "asesores_comerciales"("sucursalId", "codigo");
CREATE INDEX "asesores_comerciales_sucursalId_idx"
  ON "asesores_comerciales"("sucursalId");

ALTER TABLE "asesores_comerciales"
  ADD CONSTRAINT "asesores_comerciales_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ========== MedioPago ==========
ALTER TABLE "medios_pago" ADD COLUMN "sucursalId" TEXT;

DROP INDEX IF EXISTS "medios_pago_codigo_key";

CREATE UNIQUE INDEX "medios_pago_sucursalId_codigo_key"
  ON "medios_pago"("sucursalId", "codigo");
CREATE INDEX "medios_pago_sucursalId_idx"
  ON "medios_pago"("sucursalId");

ALTER TABLE "medios_pago"
  ADD CONSTRAINT "medios_pago_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ========== ServicioAdicional ==========
ALTER TABLE "servicios_adicionales" ADD COLUMN "sucursalId" TEXT;

DROP INDEX IF EXISTS "servicios_adicionales_codigo_key";

CREATE UNIQUE INDEX "servicios_adicionales_sucursalId_codigo_key"
  ON "servicios_adicionales"("sucursalId", "codigo");
CREATE INDEX "servicios_adicionales_sucursalId_idx"
  ON "servicios_adicionales"("sucursalId");

ALTER TABLE "servicios_adicionales"
  ADD CONSTRAINT "servicios_adicionales_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
