-- Sprint Chat · cierre + calificación.
--
-- Agrega:
--   * enum ConversacionEstado (ABIERTA|CERRADA).
--   * Columnas de cierre en `conversaciones`: estado, cerradaAt,
--     cerradaPorUserId, cerradaPorInactividad, ciclo.
--   * Tabla `conversacion_calificaciones`: 1-5 estrellas + comentario,
--     única por (conv, user, ciclo) para soportar múltiples cierres.
--
-- Defaults compatibles con datos existentes: estado=ABIERTA, ciclo=1.

-- CreateEnum
CREATE TYPE "ConversacionEstado" AS ENUM ('ABIERTA', 'CERRADA');

-- AlterTable
ALTER TABLE "conversaciones"
  ADD COLUMN "estado" "ConversacionEstado" NOT NULL DEFAULT 'ABIERTA',
  ADD COLUMN "cerradaAt" TIMESTAMP(3),
  ADD COLUMN "cerradaPorUserId" TEXT,
  ADD COLUMN "cerradaPorInactividad" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ciclo" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "conversaciones_estado_ultimoMensajeAt_idx" ON "conversaciones"("estado", "ultimoMensajeAt");

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_cerradaPorUserId_fkey" FOREIGN KEY ("cerradaPorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "conversacion_calificaciones" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ciclo" INTEGER NOT NULL,
    "puntaje" INTEGER NOT NULL,
    "comentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversacion_calificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversacion_calificaciones_conversacionId_userId_ciclo_key" ON "conversacion_calificaciones"("conversacionId", "userId", "ciclo");

-- CreateIndex
CREATE INDEX "conversacion_calificaciones_userId_idx" ON "conversacion_calificaciones"("userId");

-- CreateIndex
CREATE INDEX "conversacion_calificaciones_createdAt_idx" ON "conversacion_calificaciones"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "conversacion_calificaciones" ADD CONSTRAINT "conversacion_calificaciones_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "conversaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion_calificaciones" ADD CONSTRAINT "conversacion_calificaciones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
