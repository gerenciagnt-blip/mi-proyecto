-- Secuencia para generar consecutivos PQRS-000001
CREATE SEQUENCE IF NOT EXISTS pqrs_consecutivo_seq START 1;

-- CreateEnum
CREATE TYPE "PqrsTipo" AS ENUM ('PETICION', 'QUEJA', 'RECLAMO', 'SUGERENCIA', 'FELICITACION');

-- CreateEnum
CREATE TYPE "PqrsEstado" AS ENUM ('RECIBIDA', 'EN_TRAMITE', 'RESPONDIDA', 'CERRADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "PqrsDocOrigen" AS ENUM ('SOLICITANTE', 'ADMIN');

-- CreateTable
CREATE TABLE "pqrs" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "tipo" "PqrsTipo" NOT NULL,
    "estado" "PqrsEstado" NOT NULL DEFAULT 'RECIBIDA',
    "tipoDocumento" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT,
    "email" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "empresaNombre" TEXT,
    "asunto" VARCHAR(200) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "fechaLimite" TIMESTAMP(3) NOT NULL,
    "recibidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidaEn" TIMESTAMP(3),
    "cerradaEn" TIMESTAMP(3),
    "respuesta" TEXT,
    "respondidoById" TEXT,
    "notificadoEmailEn" TIMESTAMP(3),
    "notificadoWhatsappEn" TIMESTAMP(3),
    "relatedIncapacidadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pqrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pqrs_gestiones" (
    "id" TEXT NOT NULL,
    "pqrsId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "nuevoEstado" "PqrsEstado",
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pqrs_gestiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pqrs_documentos" (
    "id" TEXT NOT NULL,
    "pqrsId" TEXT NOT NULL,
    "archivoPath" TEXT NOT NULL,
    "archivoHash" TEXT NOT NULL,
    "archivoMime" TEXT NOT NULL,
    "archivoSize" INTEGER NOT NULL,
    "archivoNombreOriginal" TEXT NOT NULL,
    "origen" "PqrsDocOrigen" NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "eliminadoEn" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pqrs_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pqrs_consecutivo_key" ON "pqrs"("consecutivo");

-- CreateIndex
CREATE INDEX "pqrs_estado_idx" ON "pqrs"("estado");

-- CreateIndex
CREATE INDEX "pqrs_tipo_idx" ON "pqrs"("tipo");

-- CreateIndex
CREATE INDEX "pqrs_numeroDocumento_idx" ON "pqrs"("numeroDocumento");

-- CreateIndex
CREATE INDEX "pqrs_recibidaEn_idx" ON "pqrs"("recibidaEn");

-- CreateIndex
CREATE INDEX "pqrs_fechaLimite_idx" ON "pqrs"("fechaLimite");

-- CreateIndex
CREATE INDEX "pqrs_gestiones_pqrsId_createdAt_idx" ON "pqrs_gestiones"("pqrsId", "createdAt");

-- CreateIndex
CREATE INDEX "pqrs_documentos_pqrsId_idx" ON "pqrs_documentos"("pqrsId");

-- CreateIndex
CREATE INDEX "pqrs_documentos_origen_idx" ON "pqrs_documentos"("origen");

-- CreateIndex
CREATE INDEX "pqrs_documentos_eliminado_idx" ON "pqrs_documentos"("eliminado");

-- AddForeignKey
ALTER TABLE "pqrs" ADD CONSTRAINT "pqrs_respondidoById_fkey" FOREIGN KEY ("respondidoById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs_gestiones" ADD CONSTRAINT "pqrs_gestiones_pqrsId_fkey" FOREIGN KEY ("pqrsId") REFERENCES "pqrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs_gestiones" ADD CONSTRAINT "pqrs_gestiones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs_documentos" ADD CONSTRAINT "pqrs_documentos_pqrsId_fkey" FOREIGN KEY ("pqrsId") REFERENCES "pqrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs_documentos" ADD CONSTRAINT "pqrs_documentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
