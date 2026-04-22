-- CreateTable
CREATE TABLE "gestiones_cartera" (
    "id" TEXT NOT NULL,
    "cotizanteId" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gestiones_cartera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gestiones_cartera_cotizanteId_idx" ON "gestiones_cartera"("cotizanteId");

-- CreateIndex
CREATE INDEX "gestiones_cartera_periodoId_idx" ON "gestiones_cartera"("periodoId");

-- CreateIndex
CREATE INDEX "gestiones_cartera_cotizanteId_periodoId_idx" ON "gestiones_cartera"("cotizanteId", "periodoId");

-- AddForeignKey
ALTER TABLE "gestiones_cartera" ADD CONSTRAINT "gestiones_cartera_cotizanteId_fkey" FOREIGN KEY ("cotizanteId") REFERENCES "cotizantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestiones_cartera" ADD CONSTRAINT "gestiones_cartera_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos_contables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

