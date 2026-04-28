-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IncapacidadDocumentoTipo" ADD VALUE 'DERECHO_PETICION';
ALTER TYPE "IncapacidadDocumentoTipo" ADD VALUE 'TUTELA';
ALTER TYPE "IncapacidadDocumentoTipo" ADD VALUE 'DESACATO';
ALTER TYPE "IncapacidadDocumentoTipo" ADD VALUE 'RESOLUCION';
ALTER TYPE "IncapacidadDocumentoTipo" ADD VALUE 'OTRO_JURIDICO';
