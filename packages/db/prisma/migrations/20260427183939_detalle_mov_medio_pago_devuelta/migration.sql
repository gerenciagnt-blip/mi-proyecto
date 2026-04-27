-- CreateEnum
CREATE TYPE "MedioPagoFisico" AS ENUM ('EFECTIVO', 'TRANSFERENCIA');

-- AlterEnum
ALTER TYPE "MovimientoDetalleEstado" ADD VALUE 'DEVUELTA';

-- AlterTable
ALTER TABLE "movimiento_inc_detalle" ADD COLUMN     "medioPago" "MedioPagoFisico",
ADD COLUMN     "numeroTransaccion" TEXT,
ALTER COLUMN "formaPago" DROP NOT NULL;
