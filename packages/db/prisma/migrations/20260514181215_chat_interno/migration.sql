-- Sprint Chat interno — modelos para mensajería entre staff y aliados.
--
-- Agrega:
--   * 2 enums: ConversacionTipo (DM|GRUPO), ConversacionParticipanteRol
--     (MIEMBRO|ADMIN).
--   * 3 tablas: conversaciones, conversacion_participantes, mensajes.
--   * Índices para listado por actividad y unread count.
--
-- Las reglas de elegibilidad (quién puede chatear con quién) viven en la
-- capa de aplicación — la BD solo garantiza integridad referencial.

-- CreateEnum
CREATE TYPE "ConversacionTipo" AS ENUM ('DM', 'GRUPO');

-- CreateEnum
CREATE TYPE "ConversacionParticipanteRol" AS ENUM ('MIEMBRO', 'ADMIN');

-- CreateTable
CREATE TABLE "conversaciones" (
    "id" TEXT NOT NULL,
    "tipo" "ConversacionTipo" NOT NULL,
    "nombre" TEXT,
    "createdById" TEXT NOT NULL,
    "ultimoMensajeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversacion_participantes" (
    "conversacionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rolEnConv" "ConversacionParticipanteRol" NOT NULL DEFAULT 'MIEMBRO',
    "lastReadAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversacion_participantes_pkey" PRIMARY KEY ("conversacionId","userId")
);

-- CreateTable
CREATE TABLE "mensajes" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "editadoAt" TIMESTAMP(3),
    "borradoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversaciones_ultimoMensajeAt_idx" ON "conversaciones"("ultimoMensajeAt" DESC);

-- CreateIndex
CREATE INDEX "conversacion_participantes_userId_idx" ON "conversacion_participantes"("userId");

-- CreateIndex
CREATE INDEX "mensajes_conversacionId_createdAt_idx" ON "mensajes"("conversacionId", "createdAt");

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion_participantes" ADD CONSTRAINT "conversacion_participantes_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "conversaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion_participantes" ADD CONSTRAINT "conversacion_participantes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "conversaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
