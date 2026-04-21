-- AlterTable
ALTER TABLE "sucursales" ADD COLUMN     "bloqueadaPorMora" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cuentas_cobro" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nit" TEXT,
    "dv" TEXT,
    "tipoPersona" "TipoPersona",
    "repLegalTipoDoc" "TipoDocumento",
    "repLegalNumeroDoc" TEXT,
    "repLegalNombre" TEXT,
    "direccion" TEXT,
    "ciudad" TEXT,
    "departamento" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_cobro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cuentas_cobro_sucursalId_idx" ON "cuentas_cobro"("sucursalId");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_cobro_sucursalId_codigo_key" ON "cuentas_cobro"("sucursalId", "codigo");

-- AddForeignKey
ALTER TABLE "cuentas_cobro" ADD CONSTRAINT "cuentas_cobro_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

