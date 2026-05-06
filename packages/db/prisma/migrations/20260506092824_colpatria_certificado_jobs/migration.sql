-- Sprint 8.6 — Certificado de afiliación vigente (on-demand, sin retención).
-- Cola similar a colpatria_afiliacion_jobs pero más liviana: solo metadata
-- + path al PDF temporal. Se borra al servir; el campo entregadoAt marca
-- cuándo se entregó (después no se vuelve a servir).

CREATE TABLE "colpatria_certificado_jobs" (
    "id" TEXT NOT NULL,
    "afiliacionId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "ColpatriaJobStatus" NOT NULL DEFAULT 'PENDING',
    "intento" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "pdfPath" TEXT,
    "entregadoAt" TIMESTAMP(3),
    "error" TEXT,
    "errorDetalle" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colpatria_certificado_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "colpatria_certificado_jobs_status_createdAt_idx" ON "colpatria_certificado_jobs"("status", "createdAt");
CREATE INDEX "colpatria_certificado_jobs_afiliacionId_idx" ON "colpatria_certificado_jobs"("afiliacionId");
CREATE INDEX "colpatria_certificado_jobs_empresaId_status_idx" ON "colpatria_certificado_jobs"("empresaId", "status");
CREATE INDEX "colpatria_certificado_jobs_requestedById_idx" ON "colpatria_certificado_jobs"("requestedById");

ALTER TABLE "colpatria_certificado_jobs"
    ADD CONSTRAINT "colpatria_certificado_jobs_afiliacionId_fkey"
    FOREIGN KEY ("afiliacionId") REFERENCES "afiliaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "colpatria_certificado_jobs"
    ADD CONSTRAINT "colpatria_certificado_jobs_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "colpatria_certificado_jobs"
    ADD CONSTRAINT "colpatria_certificado_jobs_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
