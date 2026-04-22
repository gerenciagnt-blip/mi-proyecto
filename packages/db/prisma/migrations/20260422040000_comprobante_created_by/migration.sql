-- AlterTable
ALTER TABLE "comprobantes" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "comprobantes_createdById_idx" ON "comprobantes"("createdById");

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

