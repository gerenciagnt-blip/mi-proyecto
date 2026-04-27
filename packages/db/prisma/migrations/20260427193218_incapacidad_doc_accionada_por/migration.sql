-- AlterTable
ALTER TABLE "incapacidad_documentos" ADD COLUMN     "accionadaPor" "IncapacidadAccionadaPor" NOT NULL DEFAULT 'ALIADO',
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "incapacidad_documentos_userId_idx" ON "incapacidad_documentos"("userId");

-- AddForeignKey
ALTER TABLE "incapacidad_documentos" ADD CONSTRAINT "incapacidad_documentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
