-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "fechaInicioActividades" TIMESTAMP(3);

-- RenameIndex
ALTER INDEX "cartera_consolidado_empresa_entidad_periodo_key" RENAME TO "cartera_consolidado_empresaNit_entidadNombre_periodoHasta_key";
