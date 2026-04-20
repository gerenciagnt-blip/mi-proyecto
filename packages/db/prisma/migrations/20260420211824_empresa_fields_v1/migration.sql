-- CreateEnum
CREATE TYPE "TipoPersona" AS ENUM ('NATURAL', 'JURIDICA');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CC', 'CE', 'NIT', 'PAS', 'TI', 'RC', 'NIP');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "ciiuPrincipal" TEXT,
ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "departamento" TEXT,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "dv" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "nombreComercial" TEXT,
ADD COLUMN     "repLegalNombre" TEXT,
ADD COLUMN     "repLegalNumeroDoc" TEXT,
ADD COLUMN     "repLegalTipoDoc" "TipoDocumento",
ADD COLUMN     "telefono" TEXT,
ADD COLUMN     "tipoPersona" "TipoPersona";
