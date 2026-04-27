-- AlterEnum
ALTER TYPE "SoporteAfAccionadaPor" ADD VALUE 'BOT';

-- AlterTable
ALTER TABLE "movimiento_incapacidad" ADD COLUMN     "entidadSgssId" TEXT;

-- AlterTable
ALTER TABLE "soporte_afiliacion" ADD COLUMN     "asignadoAUserId" TEXT;

-- CreateIndex
CREATE INDEX "movimiento_incapacidad_entidadSgssId_idx" ON "movimiento_incapacidad"("entidadSgssId");

-- CreateIndex
CREATE INDEX "soporte_afiliacion_asignadoAUserId_idx" ON "soporte_afiliacion"("asignadoAUserId");

-- AddForeignKey
ALTER TABLE "soporte_afiliacion" ADD CONSTRAINT "soporte_afiliacion_asignadoAUserId_fkey" FOREIGN KEY ("asignadoAUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_incapacidad" ADD CONSTRAINT "movimiento_incapacidad_entidadSgssId_fkey" FOREIGN KEY ("entidadSgssId") REFERENCES "entidades_sgss"("id") ON DELETE SET NULL ON UPDATE CASCADE;
