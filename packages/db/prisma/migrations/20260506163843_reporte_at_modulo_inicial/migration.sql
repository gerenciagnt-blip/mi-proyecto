-- Módulo Reporte AT (accidentes/incidentes de trabajo) — flujo Aliado→Soporte.
-- Aliado radica desde Administrativo, Soporte gestiona estado.

-- CreateEnum
CREATE TYPE "ReporteATEstado" AS ENUM ('RADICADO', 'EN_REVISION', 'CERRADO', 'ANULADO');

CREATE TYPE "ReporteATCausa" AS ENUM (
    'IMPRUDENCIA_PROPIA',
    'IMPRUDENCIA_OTROS',
    'FALTA_INSTRUCCIONES',
    'POCA_EXPERIENCIA',
    'MEDIDAS_INADECUADAS',
    'RIESGOS_PROPIOS',
    'OTROS'
);

CREATE TYPE "ReporteATAccionadaPor" AS ENUM ('SOPORTE', 'ALIADO');

-- CreateTable: reporte_at
CREATE TABLE "reporte_at" (
    "id" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "fechaRadicacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sucursalId" TEXT NOT NULL,
    "cotizanteId" TEXT,

    "fechaAccidente" TIMESTAMP(3) NOT NULL,
    "diaSemanaAccidente" TEXT,
    "horaAccidente" TEXT NOT NULL,
    "horaInicioJornada" TEXT NOT NULL,
    "lugar" TEXT NOT NULL,
    "ciudadAccidente" TEXT NOT NULL,
    "departamentoAccidente" TEXT NOT NULL,

    "trabajadorNombre" TEXT NOT NULL,
    "trabajadorTipoDoc" TEXT NOT NULL,
    "trabajadorNumeroDoc" TEXT NOT NULL,
    "trabajadorFondoPension" TEXT,
    "trabajadorEps" TEXT,
    "trabajadorCargo" TEXT NOT NULL,
    "trabajadorExperienciaMeses" INTEGER,
    "trabajadorTelefono" TEXT,
    "trabajadorDireccion" TEXT,
    "trabajadorCiudadResidencia" TEXT,
    "trabajadorEstadoCivil" TEXT,
    "trabajadorEdad" INTEGER,

    "empresaRazonSocial" TEXT NOT NULL,
    "empresaNit" TEXT NOT NULL,

    "hechosQueOcurrio" TEXT NOT NULL,
    "hechosCuandoDonde" TEXT NOT NULL,
    "hechosComoOcurrio" TEXT NOT NULL,

    "causas" "ReporteATCausa"[],
    "causasOtros" TEXT,

    "partesCuerpo" JSONB NOT NULL,

    "responsableNombre" TEXT NOT NULL,
    "responsableTelefono" TEXT NOT NULL,
    "responsableCorreo" TEXT NOT NULL,

    "responsable2Nombre" TEXT,
    "responsable2Telefono" TEXT,
    "responsable2Correo" TEXT,

    "trabajadorCorreoFirma" TEXT,

    "fechaElaboracion" TIMESTAMP(3) NOT NULL,
    "estado" "ReporteATEstado" NOT NULL DEFAULT 'RADICADO',
    "observaciones" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reporte_at_pkey" PRIMARY KEY ("id")
);

-- CreateTable: reporte_at_gestion
CREATE TABLE "reporte_at_gestion" (
    "id" TEXT NOT NULL,
    "reporteAtId" TEXT NOT NULL,
    "accionadaPor" "ReporteATAccionadaPor" NOT NULL,
    "nuevoEstado" "ReporteATEstado",
    "descripcion" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporte_at_gestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reporte_at_consecutivo_key" ON "reporte_at"("consecutivo");
CREATE INDEX "reporte_at_sucursalId_idx" ON "reporte_at"("sucursalId");
CREATE INDEX "reporte_at_cotizanteId_idx" ON "reporte_at"("cotizanteId");
CREATE INDEX "reporte_at_estado_idx" ON "reporte_at"("estado");
CREATE INDEX "reporte_at_fechaRadicacion_idx" ON "reporte_at"("fechaRadicacion");
CREATE INDEX "reporte_at_sucursalId_estado_fechaRadicacion_idx"
    ON "reporte_at"("sucursalId", "estado", "fechaRadicacion" DESC);

CREATE INDEX "reporte_at_gestion_reporteAtId_idx" ON "reporte_at_gestion"("reporteAtId");
CREATE INDEX "reporte_at_gestion_userId_idx" ON "reporte_at_gestion"("userId");

-- AddForeignKey
ALTER TABLE "reporte_at"
    ADD CONSTRAINT "reporte_at_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reporte_at"
    ADD CONSTRAINT "reporte_at_cotizanteId_fkey"
    FOREIGN KEY ("cotizanteId") REFERENCES "cotizantes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reporte_at"
    ADD CONSTRAINT "reporte_at_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reporte_at_gestion"
    ADD CONSTRAINT "reporte_at_gestion_reporteAtId_fkey"
    FOREIGN KEY ("reporteAtId") REFERENCES "reporte_at"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reporte_at_gestion"
    ADD CONSTRAINT "reporte_at_gestion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Secuencia global para el consecutivo RAT-NNNNNN (idempotente).
CREATE SEQUENCE IF NOT EXISTS "reporte_at_consecutivo_seq" START 1;
