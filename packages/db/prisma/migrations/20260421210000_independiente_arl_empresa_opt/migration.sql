-- Para INDEPENDIENTE: empresa y régimen dejan de aplicar; ARL se elige directamente.

-- AlterTable
ALTER TABLE "afiliaciones" ADD COLUMN "arlId" TEXT,
ALTER COLUMN "empresaId" DROP NOT NULL,
ALTER COLUMN "regimen" DROP NOT NULL,
ALTER COLUMN "regimen" DROP DEFAULT;

-- Limpieza: régimen sólo tiene sentido en DEPENDIENTE
UPDATE "afiliaciones" SET "regimen" = NULL WHERE "modalidad" = 'INDEPENDIENTE';

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_arlId_fkey"
  FOREIGN KEY ("arlId") REFERENCES "entidades_sgss"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index útil para reportería por ARL (independientes)
CREATE INDEX "afiliaciones_arlId_idx" ON "afiliaciones"("arlId");
