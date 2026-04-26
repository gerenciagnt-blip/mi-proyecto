-- DropIndex
DROP INDEX "audit_logs_userId_idx";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "entidadSucursalId" TEXT,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "userRole" "Role",
ADD COLUMN     "userSucursalId" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userSucursalId_createdAt_idx" ON "audit_logs"("userSucursalId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entidadSucursalId_createdAt_idx" ON "audit_logs"("entidadSucursalId", "createdAt");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userSucursalId_fkey" FOREIGN KEY ("userSucursalId") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_entidadSucursalId_fkey" FOREIGN KEY ("entidadSucursalId") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
