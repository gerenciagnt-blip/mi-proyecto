-- CreateEnum
CREATE TYPE "SoporteAfTipoDisparo" AS ENUM ('NUEVA', 'REACTIVACION', 'CAMBIO_FECHA_INGRESO', 'CAMBIO_EMPRESA', 'CAMBIO_NIVEL_ARL', 'CAMBIO_PLAN_SGSS');

-- CreateEnum
CREATE TYPE "SoporteAfEstado" AS ENUM ('EN_PROCESO', 'PROCESADA', 'RECHAZADA', 'NOVEDAD');

-- CreateEnum
CREATE TYPE "SoporteAfAccionadaPor" AS ENUM ('SOPORTE', 'ALIADO');

-- CreateTable
CREATE TABLE "soporte_afiliacion" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "fechaRadicacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "afiliacionId" TEXT NOT NULL,
    "cotizanteId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "createdById" TEXT,
    "disparos" "SoporteAfTipoDisparo"[],
    "snapshotAntes" JSONB,
    "snapshotDespues" JSONB,
    "modalidadSnap" "Modalidad" NOT NULL,
    "planNombreSnap" TEXT,
    "regimenSnap" "Regimen",
    "estado" "SoporteAfEstado" NOT NULL DEFAULT 'EN_PROCESO',
    "estadoObservaciones" TEXT,
    "gestionadoPorId" TEXT,
    "gestionadoEn" TIMESTAMP(3),
    "periodoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "soporte_afiliacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soporte_afiliacion_documentos" (
    "id" TEXT NOT NULL,
    "soporteAfId" TEXT NOT NULL,
    "accionadaPor" "SoporteAfAccionadaPor" NOT NULL,
    "descripcion" TEXT,
    "archivoPath" TEXT NOT NULL,
    "archivoHash" TEXT NOT NULL,
    "archivoMime" TEXT NOT NULL,
    "archivoSize" INTEGER NOT NULL,
    "archivoNombreOriginal" TEXT NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "eliminadoEn" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "soporte_afiliacion_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soporte_afiliacion_gestion" (
    "id" TEXT NOT NULL,
    "soporteAfId" TEXT NOT NULL,
    "accionadaPor" "SoporteAfAccionadaPor" NOT NULL,
    "nuevoEstado" "SoporteAfEstado",
    "descripcion" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "soporte_afiliacion_gestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "soporte_afiliacion_consecutivo_key" ON "soporte_afiliacion"("consecutivo");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_sucursalId_estado_idx" ON "soporte_afiliacion"("sucursalId", "estado");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_periodoId_idx" ON "soporte_afiliacion"("periodoId");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_createdById_idx" ON "soporte_afiliacion"("createdById");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_afiliacionId_idx" ON "soporte_afiliacion"("afiliacionId");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_cotizanteId_idx" ON "soporte_afiliacion"("cotizanteId");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_fechaRadicacion_idx" ON "soporte_afiliacion"("fechaRadicacion");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_documentos_soporteAfId_idx" ON "soporte_afiliacion_documentos"("soporteAfId");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_documentos_eliminado_idx" ON "soporte_afiliacion_documentos"("eliminado");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_gestion_soporteAfId_idx" ON "soporte_afiliacion_gestion"("soporteAfId");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_gestion_userId_idx" ON "soporte_afiliacion_gestion"("userId");

-- AddForeignKey
ALTER TABLE "soporte_afiliacion" ADD CONSTRAINT "soporte_afiliacion_afiliacionId_fkey" FOREIGN KEY ("afiliacionId") REFERENCES "afiliaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_afiliacion" ADD CONSTRAINT "soporte_afiliacion_cotizanteId_fkey" FOREIGN KEY ("cotizanteId") REFERENCES "cotizantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_afiliacion" ADD CONSTRAINT "soporte_afiliacion_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_afiliacion" ADD CONSTRAINT "soporte_afiliacion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_afiliacion" ADD CONSTRAINT "soporte_afiliacion_gestionadoPorId_fkey" FOREIGN KEY ("gestionadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_afiliacion" ADD CONSTRAINT "soporte_afiliacion_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos_contables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_afiliacion_documentos" ADD CONSTRAINT "soporte_afiliacion_documentos_soporteAfId_fkey" FOREIGN KEY ("soporteAfId") REFERENCES "soporte_afiliacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_afiliacion_documentos" ADD CONSTRAINT "soporte_afiliacion_documentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_afiliacion_gestion" ADD CONSTRAINT "soporte_afiliacion_gestion_soporteAfId_fkey" FOREIGN KEY ("soporteAfId") REFERENCES "soporte_afiliacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_afiliacion_gestion" ADD CONSTRAINT "soporte_afiliacion_gestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Secuencia para consecutivo SOP-AF-000001 (global autoincrement)
CREATE SEQUENCE IF NOT EXISTS "soporte_af_consecutivo_seq" START 1;
