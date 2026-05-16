-- CreateTable
CREATE TABLE "mensaje_menciones" (
    "id" TEXT NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensaje_menciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensaje_menciones_mensajeId_idx" ON "mensaje_menciones"("mensajeId");

-- CreateIndex
CREATE INDEX "mensaje_menciones_userId_createdAt_idx" ON "mensaje_menciones"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mensaje_menciones_mensajeId_userId_key" ON "mensaje_menciones"("mensajeId", "userId");

-- AddForeignKey
ALTER TABLE "mensaje_menciones" ADD CONSTRAINT "mensaje_menciones_mensajeId_fkey" FOREIGN KEY ("mensajeId") REFERENCES "mensajes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje_menciones" ADD CONSTRAINT "mensaje_menciones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
