-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SOPORTE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "rolCustomId" TEXT;

-- CreateIndex
CREATE INDEX "users_rolCustomId_idx" ON "users"("rolCustomId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_rolCustomId_fkey" FOREIGN KEY ("rolCustomId") REFERENCES "roles_custom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
