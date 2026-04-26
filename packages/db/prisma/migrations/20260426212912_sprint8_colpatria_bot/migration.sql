-- CreateEnum
CREATE TYPE "ColpatriaJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYABLE');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "colpatriaActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "colpatriaPasswordEnc" TEXT,
ADD COLUMN     "colpatriaPasswordSetAt" TIMESTAMP(3),
ADD COLUMN     "colpatriaUsuario" TEXT;

-- CreateTable
CREATE TABLE "colpatria_sesiones" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "cookiesEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiraEn" TIMESTAMP(3),

    CONSTRAINT "colpatria_sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colpatria_afiliacion_jobs" (
    "id" TEXT NOT NULL,
    "afiliacionId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "status" "ColpatriaJobStatus" NOT NULL DEFAULT 'PENDING',
    "intento" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "pdfPath" TEXT,
    "screenshotsPaths" JSONB,
    "error" TEXT,
    "errorDetalle" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colpatria_afiliacion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "colpatria_sesiones_empresaId_key" ON "colpatria_sesiones"("empresaId");

-- CreateIndex
CREATE INDEX "colpatria_afiliacion_jobs_status_createdAt_idx" ON "colpatria_afiliacion_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "colpatria_afiliacion_jobs_afiliacionId_idx" ON "colpatria_afiliacion_jobs"("afiliacionId");

-- CreateIndex
CREATE INDEX "colpatria_afiliacion_jobs_empresaId_status_idx" ON "colpatria_afiliacion_jobs"("empresaId", "status");

-- AddForeignKey
ALTER TABLE "colpatria_sesiones" ADD CONSTRAINT "colpatria_sesiones_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colpatria_afiliacion_jobs" ADD CONSTRAINT "colpatria_afiliacion_jobs_afiliacionId_fkey" FOREIGN KEY ("afiliacionId") REFERENCES "afiliaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colpatria_afiliacion_jobs" ADD CONSTRAINT "colpatria_afiliacion_jobs_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
