-- CreateTable
CREATE TABLE "mensaje_reacciones" (
    "id" TEXT NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensaje_reacciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensaje_reacciones_mensajeId_idx" ON "mensaje_reacciones"("mensajeId");

-- CreateIndex
CREATE INDEX "mensaje_reacciones_userId_idx" ON "mensaje_reacciones"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mensaje_reacciones_mensajeId_userId_emoji_key" ON "mensaje_reacciones"("mensajeId", "userId", "emoji");

-- AddForeignKey
ALTER TABLE "mensaje_reacciones" ADD CONSTRAINT "mensaje_reacciones_mensajeId_fkey" FOREIGN KEY ("mensajeId") REFERENCES "mensajes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje_reacciones" ADD CONSTRAINT "mensaje_reacciones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
