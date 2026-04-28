-- AlterEnum
ALTER TYPE "IncapacidadAccionadaPor" ADD VALUE 'JURIDICO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IncapacidadEstado" ADD VALUE 'TRASLADO_A_JURIDICO';
ALTER TYPE "IncapacidadEstado" ADD VALUE 'EN_PROCESO_JURIDICO';

-- AlterTable
ALTER TABLE "incapacidad_documentos" ADD COLUMN     "confidencial" BOOLEAN NOT NULL DEFAULT false;
