-- Fase 1.6.1: unifica catalogos SGSS en una tabla tipada (EPS/AFP/ARL/CCF)
-- Preserva datos existentes del catalogo Arl copiandolos a entidades_sgss
-- manteniendo los ids para que la FK de empresas.arlId siga siendo valida.

-- 1. Crear enum de tipos
CREATE TYPE "TipoEntidadSgss" AS ENUM ('EPS', 'AFP', 'ARL', 'CCF');

-- 2. Crear tabla unificada
CREATE TABLE "entidades_sgss" (
    "id" TEXT NOT NULL,
    "tipo" "TipoEntidadSgss" NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigoMinSalud" TEXT,
    "nit" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "entidades_sgss_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "entidades_sgss_tipo_codigo_key" ON "entidades_sgss"("tipo", "codigo");
CREATE INDEX "entidades_sgss_tipo_idx" ON "entidades_sgss"("tipo");

-- 3. Copiar datos del catalogo Arl preservando ids para no romper FKs
INSERT INTO "entidades_sgss" ("id", "tipo", "codigo", "nombre", "active", "createdAt", "updatedAt")
SELECT "id", 'ARL'::"TipoEntidadSgss", "codigo", "nombre", "active", "createdAt", "updatedAt"
FROM "arls";

-- 4. Retargetear FK empresas.arlId desde arls -> entidades_sgss
ALTER TABLE "empresas" DROP CONSTRAINT IF EXISTS "empresas_arlId_fkey";
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_arlId_fkey"
    FOREIGN KEY ("arlId") REFERENCES "entidades_sgss"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Eliminar tabla vieja (datos ya fueron migrados en paso 3)
DROP TABLE "arls";
