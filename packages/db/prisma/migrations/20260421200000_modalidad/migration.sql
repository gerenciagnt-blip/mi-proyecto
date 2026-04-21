-- CreateEnum
CREATE TYPE "Modalidad" AS ENUM ('DEPENDIENTE', 'INDEPENDIENTE');

-- AlterTable: TipoCotizante
ALTER TABLE "tipos_cotizante" ADD COLUMN "modalidad" "Modalidad" NOT NULL DEFAULT 'DEPENDIENTE';

-- Backfill: tipos de cotizante conocidos como INDEPENDIENTE (PILA Colombia)
-- Códigos de referencia Min. Salud - Resolución 2388 (modificada).
UPDATE "tipos_cotizante" SET "modalidad" = 'INDEPENDIENTE'
  WHERE "codigo" IN (
    '03',  -- Independiente
    '16',  -- Independiente agremiado
    '32',  -- Trabajador cuenta propia (a partir de 1 SMLV)
    '43',  -- Contratos prestación de servicios
    '47',  -- Beneficiario UPC adicional (subsidiado)
    '51',  -- Trabajador independiente
    '57',  -- Independiente pensionado por vejez activo
    '58',  -- Beneficiario colombianos en el exterior
    '59'   -- Independiente voluntario al SGR
  );

-- AlterTable: Afiliacion
ALTER TABLE "afiliaciones" ADD COLUMN "modalidad" "Modalidad" NOT NULL DEFAULT 'DEPENDIENTE';

-- Backfill: propagar la modalidad del tipo de cotizante a cada afiliación.
UPDATE "afiliaciones" a
  SET "modalidad" = tc."modalidad"
  FROM "tipos_cotizante" tc
  WHERE a."tipoCotizanteId" = tc."id";

-- Backfill: valorAdministracion nulos → 0 antes del NOT NULL
UPDATE "afiliaciones" SET "valorAdministracion" = 0 WHERE "valorAdministracion" IS NULL;

-- AlterColumn: valorAdministracion ahora obligatorio
ALTER TABLE "afiliaciones" ALTER COLUMN "valorAdministracion" SET NOT NULL;

-- CreateIndex
CREATE INDEX "afiliaciones_modalidad_idx" ON "afiliaciones"("modalidad");
