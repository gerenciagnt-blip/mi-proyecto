-- Sistema de notificaciones in-app.
--
-- Una notificación tiene targeting tripartito (user / role / sucursal).
-- La tabla `notificacion_lectura` registra qué usuario leyó qué — esto
-- permite que las notificaciones dirigidas a un rol o sucursal mantengan
-- estado de lectura por usuario sin duplicar la notificación origen.

CREATE TYPE "NotificacionTipo" AS ENUM (
  'SOPORTE_NUEVA_AFILIACION',
  'SOPORTE_NUEVA_INCAPACIDAD',
  'SOPORTE_RESPUESTA_CARTERA',
  'ALIADO_CARTERA_ASIGNADA',
  'ALIADO_GESTION_INCAPACIDAD'
);

CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "tipo" "NotificacionTipo" NOT NULL,
    "destinoUserId" TEXT,
    "destinoRole" "Role",
    "destinoSucursalId" TEXT,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "href" TEXT,
    "metadatos" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notificaciones_destinoUserId_createdAt_idx"
  ON "notificaciones"("destinoUserId", "createdAt");
CREATE INDEX "notificaciones_destinoRole_createdAt_idx"
  ON "notificaciones"("destinoRole", "createdAt");
CREATE INDEX "notificaciones_destinoSucursalId_createdAt_idx"
  ON "notificaciones"("destinoSucursalId", "createdAt");

ALTER TABLE "notificaciones"
  ADD CONSTRAINT "notificaciones_destinoUserId_fkey"
  FOREIGN KEY ("destinoUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notificaciones"
  ADD CONSTRAINT "notificaciones_destinoSucursalId_fkey"
  FOREIGN KEY ("destinoSucursalId") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notificacion_lectura" (
    "id" TEXT NOT NULL,
    "notificacionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_lectura_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notificacion_lectura_notificacionId_userId_key"
  ON "notificacion_lectura"("notificacionId", "userId");
CREATE INDEX "notificacion_lectura_userId_idx"
  ON "notificacion_lectura"("userId");

ALTER TABLE "notificacion_lectura"
  ADD CONSTRAINT "notificacion_lectura_notificacionId_fkey"
  FOREIGN KEY ("notificacionId") REFERENCES "notificaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
