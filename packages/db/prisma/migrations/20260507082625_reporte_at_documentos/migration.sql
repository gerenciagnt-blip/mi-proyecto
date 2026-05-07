-- Adjuntos en módulo Reporte AT (soporte FURAT). Retención corta de 30
-- días — el cron `retention:run` borra el archivo físico y deja el
-- registro como evidencia.

CREATE TYPE "ReporteATDocumentoTipo" AS ENUM ('FURAT', 'OTRO');

CREATE TABLE "reporte_at_documentos" (
    "id" TEXT NOT NULL,
    "reporteAtId" TEXT NOT NULL,
    "tipo" "ReporteATDocumentoTipo" NOT NULL,
    "archivoPath" TEXT NOT NULL,
    "archivoHash" TEXT NOT NULL,
    "archivoMime" TEXT NOT NULL,
    "archivoSize" INTEGER NOT NULL,
    "archivoNombreOriginal" TEXT NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "eliminadoEn" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporte_at_documentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reporte_at_documentos_reporteAtId_idx" ON "reporte_at_documentos"("reporteAtId");
CREATE INDEX "reporte_at_documentos_tipo_idx" ON "reporte_at_documentos"("tipo");
CREATE INDEX "reporte_at_documentos_eliminado_idx" ON "reporte_at_documentos"("eliminado");
CREATE INDEX "reporte_at_documentos_userId_idx" ON "reporte_at_documentos"("userId");

ALTER TABLE "reporte_at_documentos"
    ADD CONSTRAINT "reporte_at_documentos_reporteAtId_fkey"
    FOREIGN KEY ("reporteAtId") REFERENCES "reporte_at"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reporte_at_documentos"
    ADD CONSTRAINT "reporte_at_documentos_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
