-- Módulo Cartera (Soporte + Administrativo): estados de cuenta de
-- entidades SGSS. Soporte importa el PDF, marca la línea como
-- CARTERA_REAL, y el aliado (Administrativo) la ve para gestionarla.

-- ========== Enums ==========
CREATE TYPE "CarteraTipoEntidad" AS ENUM ('EPS', 'AFP', 'ARL', 'CCF');

CREATE TYPE "CarteraEstado" AS ENUM (
  'EN_CONCILIACION',
  'CONCILIADA',
  'CARTERA_REAL',
  'PAGADA_CARTERA_REAL'
);

CREATE TYPE "CarteraOrigenPdf" AS ENUM (
  'PROTECCION',
  'SALUD_TOTAL',
  'EPS_SOS',
  'EPS_SURA',
  'EPS_SANITAS',
  'MANUAL'
);

CREATE TYPE "CarteraAccionadaPor" AS ENUM ('SOPORTE', 'ALIADO');

-- ========== cartera_consolidado ==========
CREATE TABLE "cartera_consolidado" (
  "id"                  TEXT NOT NULL,
  "consecutivo"         TEXT NOT NULL,
  "fechaRegistro"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tipoEntidad"         "CarteraTipoEntidad" NOT NULL,
  "entidadNombre"       TEXT NOT NULL,
  "entidadNit"          TEXT,
  "empresaNit"          TEXT NOT NULL,
  "empresaRazonSocial"  TEXT NOT NULL,
  "empresaId"           TEXT,
  "periodoDesde"        TEXT,
  "periodoHasta"        TEXT,
  "cantidadRegistros"   INTEGER NOT NULL DEFAULT 0,
  "valorTotalInformado" DECIMAL(15,2) NOT NULL,
  "estado"              "CarteraEstado" NOT NULL DEFAULT 'EN_CONCILIACION',
  "origenPdf"           "CarteraOrigenPdf",
  "archivoOrigenPath"   TEXT,
  "archivoOrigenHash"   TEXT,
  "observaciones"       TEXT,
  "createdById"         TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cartera_consolidado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cartera_consolidado_consecutivo_key"
  ON "cartera_consolidado"("consecutivo");

-- Bloqueo de re-imports silenciosos: si el staff sube dos veces el mismo
-- estado de cuenta, el action exige confirmación explícita para reemplazar.
CREATE UNIQUE INDEX "cartera_consolidado_empresa_entidad_periodo_key"
  ON "cartera_consolidado"("empresaNit", "entidadNombre", "periodoHasta");

CREATE INDEX "cartera_consolidado_empresaId_idx"      ON "cartera_consolidado"("empresaId");
CREATE INDEX "cartera_consolidado_estado_idx"         ON "cartera_consolidado"("estado");
CREATE INDEX "cartera_consolidado_fechaRegistro_idx"  ON "cartera_consolidado"("fechaRegistro");

ALTER TABLE "cartera_consolidado"
  ADD CONSTRAINT "cartera_consolidado_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "empresas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cartera_consolidado"
  ADD CONSTRAINT "cartera_consolidado_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Secuencia del consecutivo (CC-000001). La alimentamos por código en el action.
CREATE SEQUENCE IF NOT EXISTS "cartera_consolidado_consecutivo_seq" START 1;

-- ========== cartera_detallado ==========
CREATE TABLE "cartera_detallado" (
  "id"                 TEXT NOT NULL,
  "consolidadoId"      TEXT NOT NULL,
  "tipoDocumento"      "TipoDocumento" NOT NULL,
  "numeroDocumento"    TEXT NOT NULL,
  "nombreCompleto"     TEXT NOT NULL,
  "periodoCobro"       TEXT NOT NULL,
  "valorCobro"         DECIMAL(15,2) NOT NULL,
  "ibc"                DECIMAL(15,2),
  "novedad"            TEXT,
  "sucursalAsignadaId" TEXT,
  "cotizanteId"        TEXT,
  "estado"             "CarteraEstado" NOT NULL DEFAULT 'EN_CONCILIACION',
  "observaciones"      TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cartera_detallado_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cartera_detallado_consolidadoId_idx"      ON "cartera_detallado"("consolidadoId");
CREATE INDEX "cartera_detallado_sucursalAsignadaId_idx" ON "cartera_detallado"("sucursalAsignadaId");
CREATE INDEX "cartera_detallado_cotizanteId_idx"        ON "cartera_detallado"("cotizanteId");
CREATE INDEX "cartera_detallado_estado_idx"             ON "cartera_detallado"("estado");
CREATE INDEX "cartera_detallado_numeroDocumento_idx"    ON "cartera_detallado"("numeroDocumento");

ALTER TABLE "cartera_detallado"
  ADD CONSTRAINT "cartera_detallado_consolidadoId_fkey"
  FOREIGN KEY ("consolidadoId") REFERENCES "cartera_consolidado"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cartera_detallado"
  ADD CONSTRAINT "cartera_detallado_sucursalAsignadaId_fkey"
  FOREIGN KEY ("sucursalAsignadaId") REFERENCES "sucursales"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cartera_detallado"
  ADD CONSTRAINT "cartera_detallado_cotizanteId_fkey"
  FOREIGN KEY ("cotizanteId") REFERENCES "cotizantes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ========== cartera_gestion ==========
CREATE TABLE "cartera_gestion" (
  "id"           TEXT NOT NULL,
  "detalladoId"  TEXT NOT NULL,
  "accionadaPor" "CarteraAccionadaPor" NOT NULL,
  "nuevoEstado"  "CarteraEstado",
  "descripcion"  TEXT NOT NULL,
  "userId"       TEXT,
  "userName"     TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cartera_gestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cartera_gestion_detalladoId_idx" ON "cartera_gestion"("detalladoId");
CREATE INDEX "cartera_gestion_userId_idx"      ON "cartera_gestion"("userId");

ALTER TABLE "cartera_gestion"
  ADD CONSTRAINT "cartera_gestion_detalladoId_fkey"
  FOREIGN KEY ("detalladoId") REFERENCES "cartera_detallado"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cartera_gestion"
  ADD CONSTRAINT "cartera_gestion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
