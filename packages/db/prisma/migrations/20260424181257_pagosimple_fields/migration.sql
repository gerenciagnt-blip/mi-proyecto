-- AlterTable
ALTER TABLE "cotizantes" ADD COLUMN     "pagosimpleContributorId" TEXT,
ADD COLUMN     "pagosimpleSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "pagosimpleContributorId" TEXT,
ADD COLUMN     "pagosimpleSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "planillas" ADD COLUMN     "pagosimpleEstadoValidacion" TEXT,
ADD COLUMN     "pagosimpleNumero" TEXT,
ADD COLUMN     "pagosimplePaymentUrl" TEXT,
ADD COLUMN     "pagosimplePin" TEXT,
ADD COLUMN     "pagosimpleSyncedAt" TIMESTAMP(3);

