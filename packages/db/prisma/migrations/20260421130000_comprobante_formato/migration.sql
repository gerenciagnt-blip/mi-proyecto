-- CreateTable
CREATE TABLE "comprobante_formatos" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT 'Predeterminado',
    "logoUrl" TEXT,
    "encabezado" TEXT,
    "pieDePagina" TEXT,
    "camposConfig" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comprobante_formatos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_formatos_sucursalId_key" ON "comprobante_formatos"("sucursalId");

-- AddForeignKey
ALTER TABLE "comprobante_formatos" ADD CONSTRAINT "comprobante_formatos_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

