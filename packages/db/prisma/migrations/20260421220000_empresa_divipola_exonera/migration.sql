-- AlterTable: Empresa gana DIVIPOLA (depto/muni FK) + exoneraLey1607
ALTER TABLE "empresas"
  ADD COLUMN "departamentoId" TEXT,
  ADD COLUMN "municipioId" TEXT,
  ADD COLUMN "exoneraLey1607" BOOLEAN NOT NULL DEFAULT false;

-- Backfill oportunista: si el texto legado (departamento, ciudad) coincide
-- exactamente con un nombre de DIVIPOLA, lo enlazamos. Lo que no matchee
-- queda NULL y se podrá completar desde el formulario.
UPDATE "empresas" e
  SET "departamentoId" = d."id"
  FROM "departamentos" d
  WHERE LOWER(TRIM(e."departamento")) = LOWER(d."nombre") AND e."departamentoId" IS NULL;

UPDATE "empresas" e
  SET "municipioId" = m."id"
  FROM "municipios" m
  WHERE LOWER(TRIM(e."ciudad")) = LOWER(m."nombre")
    AND e."departamentoId" = m."departamentoId"
    AND e."municipioId" IS NULL;

-- CreateIndex
CREATE INDEX "empresas_departamentoId_idx" ON "empresas"("departamentoId");
CREATE INDEX "empresas_municipioId_idx" ON "empresas"("municipioId");

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_departamentoId_fkey"
  FOREIGN KEY ("departamentoId") REFERENCES "departamentos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "empresas" ADD CONSTRAINT "empresas_municipioId_fkey"
  FOREIGN KEY ("municipioId") REFERENCES "municipios"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
