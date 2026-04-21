-- CreateEnum
CREATE TYPE "Genero" AS ENUM ('M', 'F', 'O');

-- CreateEnum
CREATE TYPE "EstadoAfiliacion" AS ENUM ('ACTIVA', 'INACTIVA');

-- CreateTable
CREATE TABLE "cotizantes" (
    "id" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumento" NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "primerNombre" TEXT NOT NULL,
    "segundoNombre" TEXT,
    "primerApellido" TEXT NOT NULL,
    "segundoApellido" TEXT,
    "fechaNacimiento" TIMESTAMP(3) NOT NULL,
    "genero" "Genero" NOT NULL,
    "telefono" TEXT,
    "celular" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "ciudad" TEXT,
    "departamento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "afiliaciones" (
    "id" TEXT NOT NULL,
    "cotizanteId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "cuentaCobroId" TEXT,
    "asesorComercialId" TEXT,
    "tipoCotizanteId" TEXT NOT NULL,
    "subtipoId" TEXT,
    "nivelRiesgo" "NivelRiesgo" NOT NULL,
    "salario" DECIMAL(12,2) NOT NULL,
    "fechaIngreso" TIMESTAMP(3) NOT NULL,
    "fechaRetiro" TIMESTAMP(3),
    "estado" "EstadoAfiliacion" NOT NULL DEFAULT 'ACTIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "afiliaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cotizantes_primerApellido_primerNombre_idx" ON "cotizantes"("primerApellido", "primerNombre");

-- CreateIndex
CREATE UNIQUE INDEX "cotizantes_tipoDocumento_numeroDocumento_key" ON "cotizantes"("tipoDocumento", "numeroDocumento");

-- CreateIndex
CREATE INDEX "afiliaciones_cotizanteId_idx" ON "afiliaciones"("cotizanteId");

-- CreateIndex
CREATE INDEX "afiliaciones_empresaId_idx" ON "afiliaciones"("empresaId");

-- CreateIndex
CREATE INDEX "afiliaciones_estado_idx" ON "afiliaciones"("estado");

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_cotizanteId_fkey" FOREIGN KEY ("cotizanteId") REFERENCES "cotizantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_cuentaCobroId_fkey" FOREIGN KEY ("cuentaCobroId") REFERENCES "cuentas_cobro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_asesorComercialId_fkey" FOREIGN KEY ("asesorComercialId") REFERENCES "asesores_comerciales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_tipoCotizanteId_fkey" FOREIGN KEY ("tipoCotizanteId") REFERENCES "tipos_cotizante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliaciones" ADD CONSTRAINT "afiliaciones_subtipoId_fkey" FOREIGN KEY ("subtipoId") REFERENCES "subtipos_cotizante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

