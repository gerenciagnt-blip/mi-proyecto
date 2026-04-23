-- Módulo Incapacidades: radicación (aliado) + gestión (soporte) + retención
-- de documentos por 120 días.

-- ========== Enums ==========
CREATE TYPE "IncapacidadTipo" AS ENUM (
  'ENFERMEDAD_GENERAL',
  'LICENCIA_MATERNIDAD',
  'LICENCIA_PATERNIDAD',
  'ACCIDENTE_TRABAJO',
  'ACCIDENTE_TRANSITO_SOAT'
);

CREATE TYPE "IncapacidadEstado" AS ENUM (
  'RADICADA',
  'EN_REVISION',
  'APROBADA',
  'PAGADA',
  'RECHAZADA'
);

CREATE TYPE "IncapacidadDocumentoTipo" AS ENUM (
  'COPIA_CEDULA',
  'CERTIFICADO_INCAPACIDAD',
  'HISTORIA_CLINICA',
  'CERTIFICADO_BANCARIO',
  'AUTORIZACION_PAGO_TERCEROS',
  'FURIPS_SOAT'
);

CREATE TYPE "IncapacidadAccionadaPor" AS ENUM ('SOPORTE', 'ALIADO');

-- ========== incapacidades ==========
CREATE TABLE "incapacidades" (
  "id"                        TEXT NOT NULL,
  "consecutivo"               TEXT NOT NULL,
  "fechaRadicacion"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sucursalId"                TEXT NOT NULL,
  "cotizanteId"               TEXT NOT NULL,
  "tipo"                      "IncapacidadTipo" NOT NULL,
  "fechaInicio"               TIMESTAMP(3) NOT NULL,
  "fechaFin"                  TIMESTAMP(3) NOT NULL,
  "diasIncapacidad"           INTEGER NOT NULL,
  "empresaPlanillaId"         TEXT,
  "empresaPlanillaNombreSnap" TEXT,
  "epsId"                     TEXT,
  "afpId"                     TEXT,
  "arlId"                     TEXT,
  "ccfId"                     TEXT,
  "fechaAfiliacionSnap"       TIMESTAMP(3),
  "estado"                    "IncapacidadEstado" NOT NULL DEFAULT 'RADICADA',
  "observaciones"             TEXT,
  "createdById"               TEXT,
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3) NOT NULL,

  CONSTRAINT "incapacidades_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "incapacidades_consecutivo_key"   ON "incapacidades"("consecutivo");
CREATE INDEX "incapacidades_sucursalId_idx"           ON "incapacidades"("sucursalId");
CREATE INDEX "incapacidades_cotizanteId_idx"          ON "incapacidades"("cotizanteId");
CREATE INDEX "incapacidades_estado_idx"               ON "incapacidades"("estado");
CREATE INDEX "incapacidades_tipo_idx"                 ON "incapacidades"("tipo");
CREATE INDEX "incapacidades_fechaRadicacion_idx"      ON "incapacidades"("fechaRadicacion");

ALTER TABLE "incapacidades" ADD CONSTRAINT "incapacidades_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incapacidades" ADD CONSTRAINT "incapacidades_cotizanteId_fkey"
  FOREIGN KEY ("cotizanteId") REFERENCES "cotizantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incapacidades" ADD CONSTRAINT "incapacidades_empresaPlanillaId_fkey"
  FOREIGN KEY ("empresaPlanillaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incapacidades" ADD CONSTRAINT "incapacidades_epsId_fkey"
  FOREIGN KEY ("epsId") REFERENCES "entidades_sgss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incapacidades" ADD CONSTRAINT "incapacidades_afpId_fkey"
  FOREIGN KEY ("afpId") REFERENCES "entidades_sgss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incapacidades" ADD CONSTRAINT "incapacidades_arlId_fkey"
  FOREIGN KEY ("arlId") REFERENCES "entidades_sgss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incapacidades" ADD CONSTRAINT "incapacidades_ccfId_fkey"
  FOREIGN KEY ("ccfId") REFERENCES "entidades_sgss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incapacidades" ADD CONSTRAINT "incapacidades_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Secuencia para consecutivo INC-000001
CREATE SEQUENCE IF NOT EXISTS "incapacidad_consecutivo_seq" START 1;

-- ========== incapacidad_documentos ==========
CREATE TABLE "incapacidad_documentos" (
  "id"                     TEXT NOT NULL,
  "incapacidadId"          TEXT NOT NULL,
  "tipo"                   "IncapacidadDocumentoTipo" NOT NULL,
  "archivoPath"            TEXT NOT NULL,
  "archivoHash"            TEXT NOT NULL,
  "archivoMime"            TEXT NOT NULL,
  "archivoSize"            INTEGER NOT NULL,
  "archivoNombreOriginal"  TEXT NOT NULL,
  "eliminado"              BOOLEAN NOT NULL DEFAULT false,
  "eliminadoEn"            TIMESTAMP(3),
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "incapacidad_documentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incapacidad_documentos_incapacidadId_idx" ON "incapacidad_documentos"("incapacidadId");
CREATE INDEX "incapacidad_documentos_tipo_idx"          ON "incapacidad_documentos"("tipo");
CREATE INDEX "incapacidad_documentos_eliminado_idx"     ON "incapacidad_documentos"("eliminado");

ALTER TABLE "incapacidad_documentos" ADD CONSTRAINT "incapacidad_documentos_incapacidadId_fkey"
  FOREIGN KEY ("incapacidadId") REFERENCES "incapacidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ========== incapacidad_gestion ==========
CREATE TABLE "incapacidad_gestion" (
  "id"             TEXT NOT NULL,
  "incapacidadId"  TEXT NOT NULL,
  "accionadaPor"   "IncapacidadAccionadaPor" NOT NULL,
  "nuevoEstado"    "IncapacidadEstado",
  "descripcion"    TEXT NOT NULL,
  "userId"         TEXT,
  "userName"       TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "incapacidad_gestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incapacidad_gestion_incapacidadId_idx" ON "incapacidad_gestion"("incapacidadId");
CREATE INDEX "incapacidad_gestion_userId_idx"        ON "incapacidad_gestion"("userId");

ALTER TABLE "incapacidad_gestion" ADD CONSTRAINT "incapacidad_gestion_incapacidadId_fkey"
  FOREIGN KEY ("incapacidadId") REFERENCES "incapacidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "incapacidad_gestion" ADD CONSTRAINT "incapacidad_gestion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
