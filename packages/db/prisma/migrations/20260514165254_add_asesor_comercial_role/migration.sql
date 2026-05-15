-- Sprint Rol Asesor Comercial — fase 1.
--
-- Agrega:
--   1. Valor ASESOR_COMERCIAL al enum Role (Postgres no permite ADD VALUE
--      dentro de una transacción, por eso va sin BEGIN/COMMIT explícitos —
--      Prisma usa autocommit por statement).
--   2. Columna users.asesorComercialId (TEXT NULL UNIQUE) + FK al catálogo
--      AsesorComercial con ON DELETE SET NULL.
--
-- Backfill: ninguno. Los users existentes quedan con asesorComercialId NULL.
-- La validación "si role=ASESOR_COMERCIAL ⇒ asesorComercialId requerido"
-- vive en la capa de aplicación (no en BD) para permitir crear los logins
-- desde la UI sin atar a una constraint que falle en orden de operaciones.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ASESOR_COMERCIAL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "asesorComercialId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_asesorComercialId_key" ON "users"("asesorComercialId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_asesorComercialId_fkey" FOREIGN KEY ("asesorComercialId") REFERENCES "asesores_comerciales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
