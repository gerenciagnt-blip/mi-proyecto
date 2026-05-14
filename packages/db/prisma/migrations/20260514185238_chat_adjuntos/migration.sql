-- Sprint Chat interno · adjuntos — soporte para imágenes en mensajes.
-- Solo imágenes en v1 (jpeg/png/webp/gif), 5 MB máx por archivo. Storage
-- en filesystem bajo UPLOADS_DIR/chat/<conversacionId>/<YYYY-MM>/...

-- CreateTable
CREATE TABLE "mensaje_adjuntos" (
    "id" TEXT NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "archivoPath" TEXT NOT NULL,
    "archivoHash" TEXT NOT NULL,
    "archivoMime" TEXT NOT NULL,
    "archivoNombre" TEXT NOT NULL,
    "archivoTamano" INTEGER NOT NULL,
    "ancho" INTEGER,
    "alto" INTEGER,
    "eliminado" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensaje_adjuntos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensaje_adjuntos_mensajeId_idx" ON "mensaje_adjuntos"("mensajeId");

-- AddForeignKey
ALTER TABLE "mensaje_adjuntos" ADD CONSTRAINT "mensaje_adjuntos_mensajeId_fkey" FOREIGN KEY ("mensajeId") REFERENCES "mensajes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
