-- CreateEnum
CREATE TYPE "CobroAliadoEstado" AS ENUM ('PENDIENTE', 'PAGADO', 'VENCIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "CobroAliadoConceptoTipo" AS ENUM ('AFILIACION_PROCESADA', 'MENSUALIDAD');

-- CreateEnum
CREATE TYPE "MovimientoIncEstado" AS ENUM ('PENDIENTE', 'CONCILIADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "MovimientoFormaPago" AS ENUM ('PAGO_COTIZANTE', 'PAGO_ALIADO', 'CRUCE_COBRO_ALIADO');

-- CreateEnum
CREATE TYPE "MovimientoDetalleEstado" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'PAGADA');

-- AlterTable
ALTER TABLE "sucursales" ADD COLUMN     "tarifaOrdinario" DECIMAL(12,2),
ADD COLUMN     "tarifaResolucion" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "cobro_aliado" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "fechaGenerado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaLimite" TIMESTAMP(3) NOT NULL,
    "fechaPagado" TIMESTAMP(3),
    "fechaBloqueo" TIMESTAMP(3),
    "cantAfiliaciones" INTEGER NOT NULL DEFAULT 0,
    "cantMensualidades" INTEGER NOT NULL DEFAULT 0,
    "valorAfiliaciones" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valorMensualidades" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCobro" DECIMAL(12,2) NOT NULL,
    "estado" "CobroAliadoEstado" NOT NULL DEFAULT 'PENDIENTE',
    "medioPagoId" TEXT,
    "referenciaPago" TEXT,
    "observaciones" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cobro_aliado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobro_aliado_concepto" (
    "id" TEXT NOT NULL,
    "cobroId" TEXT NOT NULL,
    "tipo" "CobroAliadoConceptoTipo" NOT NULL,
    "descripcion" TEXT,
    "referenciaId" TEXT,
    "regimen" "Regimen",
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "valorUnit" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "cobro_aliado_concepto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobro_aliado_documento" (
    "id" TEXT NOT NULL,
    "cobroId" TEXT NOT NULL,
    "archivoPath" TEXT NOT NULL,
    "archivoHash" TEXT NOT NULL,
    "archivoMime" TEXT NOT NULL,
    "archivoSize" INTEGER NOT NULL,
    "archivoNombreOriginal" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobro_aliado_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_incapacidad" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "empresaId" TEXT,
    "fechaIngreso" TIMESTAMP(3) NOT NULL,
    "concepto" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "estado" "MovimientoIncEstado" NOT NULL DEFAULT 'PENDIENTE',
    "bancoOrigen" TEXT,
    "hashIdentidad" TEXT,
    "observaciones" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movimiento_incapacidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_inc_detalle" (
    "id" TEXT NOT NULL,
    "movimientoId" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "nombreCompleto" TEXT NOT NULL,
    "cotizanteId" TEXT,
    "incapacidadId" TEXT,
    "sucursalId" TEXT,
    "fechaInicioInc" TIMESTAMP(3),
    "fechaFinInc" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "retencion4x1000" DECIMAL(12,2) NOT NULL,
    "retencionImpuesto" DECIMAL(12,2) NOT NULL,
    "totalPagar" DECIMAL(12,2) NOT NULL,
    "formaPago" "MovimientoFormaPago" NOT NULL,
    "estado" "MovimientoDetalleEstado" NOT NULL DEFAULT 'PENDIENTE',
    "fechaPago" TIMESTAMP(3),
    "pagadoConEmpresaId" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movimiento_inc_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_det_documento" (
    "id" TEXT NOT NULL,
    "detalleId" TEXT NOT NULL,
    "archivoPath" TEXT NOT NULL,
    "archivoHash" TEXT NOT NULL,
    "archivoMime" TEXT NOT NULL,
    "archivoSize" INTEGER NOT NULL,
    "archivoNombreOriginal" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_det_documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cobro_aliado_consecutivo_key" ON "cobro_aliado"("consecutivo");

-- CreateIndex
CREATE INDEX "cobro_aliado_estado_idx" ON "cobro_aliado"("estado");

-- CreateIndex
CREATE INDEX "cobro_aliado_fechaLimite_idx" ON "cobro_aliado"("fechaLimite");

-- CreateIndex
CREATE INDEX "cobro_aliado_periodoId_idx" ON "cobro_aliado"("periodoId");

-- CreateIndex
CREATE UNIQUE INDEX "cobro_aliado_sucursalId_periodoId_key" ON "cobro_aliado"("sucursalId", "periodoId");

-- CreateIndex
CREATE INDEX "cobro_aliado_concepto_cobroId_idx" ON "cobro_aliado_concepto"("cobroId");

-- CreateIndex
CREATE INDEX "cobro_aliado_concepto_tipo_idx" ON "cobro_aliado_concepto"("tipo");

-- CreateIndex
CREATE INDEX "cobro_aliado_documento_cobroId_idx" ON "cobro_aliado_documento"("cobroId");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_incapacidad_consecutivo_key" ON "movimiento_incapacidad"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_incapacidad_hashIdentidad_key" ON "movimiento_incapacidad"("hashIdentidad");

-- CreateIndex
CREATE INDEX "movimiento_incapacidad_estado_idx" ON "movimiento_incapacidad"("estado");

-- CreateIndex
CREATE INDEX "movimiento_incapacidad_fechaIngreso_idx" ON "movimiento_incapacidad"("fechaIngreso");

-- CreateIndex
CREATE INDEX "movimiento_incapacidad_empresaId_idx" ON "movimiento_incapacidad"("empresaId");

-- CreateIndex
CREATE INDEX "movimiento_inc_detalle_movimientoId_idx" ON "movimiento_inc_detalle"("movimientoId");

-- CreateIndex
CREATE INDEX "movimiento_inc_detalle_estado_idx" ON "movimiento_inc_detalle"("estado");

-- CreateIndex
CREATE INDEX "movimiento_inc_detalle_numeroDocumento_idx" ON "movimiento_inc_detalle"("numeroDocumento");

-- CreateIndex
CREATE INDEX "movimiento_inc_detalle_sucursalId_idx" ON "movimiento_inc_detalle"("sucursalId");

-- CreateIndex
CREATE INDEX "movimiento_inc_detalle_incapacidadId_idx" ON "movimiento_inc_detalle"("incapacidadId");

-- CreateIndex
CREATE INDEX "movimiento_det_documento_detalleId_idx" ON "movimiento_det_documento"("detalleId");

-- AddForeignKey
ALTER TABLE "cobro_aliado" ADD CONSTRAINT "cobro_aliado_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobro_aliado" ADD CONSTRAINT "cobro_aliado_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos_contables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobro_aliado" ADD CONSTRAINT "cobro_aliado_medioPagoId_fkey" FOREIGN KEY ("medioPagoId") REFERENCES "medios_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobro_aliado" ADD CONSTRAINT "cobro_aliado_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobro_aliado_concepto" ADD CONSTRAINT "cobro_aliado_concepto_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "cobro_aliado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobro_aliado_documento" ADD CONSTRAINT "cobro_aliado_documento_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "cobro_aliado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobro_aliado_documento" ADD CONSTRAINT "cobro_aliado_documento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_incapacidad" ADD CONSTRAINT "movimiento_incapacidad_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_incapacidad" ADD CONSTRAINT "movimiento_incapacidad_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inc_detalle" ADD CONSTRAINT "movimiento_inc_detalle_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "movimiento_incapacidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inc_detalle" ADD CONSTRAINT "movimiento_inc_detalle_cotizanteId_fkey" FOREIGN KEY ("cotizanteId") REFERENCES "cotizantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inc_detalle" ADD CONSTRAINT "movimiento_inc_detalle_incapacidadId_fkey" FOREIGN KEY ("incapacidadId") REFERENCES "incapacidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inc_detalle" ADD CONSTRAINT "movimiento_inc_detalle_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inc_detalle" ADD CONSTRAINT "movimiento_inc_detalle_pagadoConEmpresaId_fkey" FOREIGN KEY ("pagadoConEmpresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_det_documento" ADD CONSTRAINT "movimiento_det_documento_detalleId_fkey" FOREIGN KEY ("detalleId") REFERENCES "movimiento_inc_detalle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_det_documento" ADD CONSTRAINT "movimiento_det_documento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Secuencias Postgres para consecutivos globales autoincrement.
CREATE SEQUENCE IF NOT EXISTS "cobro_aliado_consecutivo_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "movimiento_inc_consecutivo_seq" START 1;
