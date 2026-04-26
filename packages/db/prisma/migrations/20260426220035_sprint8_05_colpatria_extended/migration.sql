-- AlterTable
ALTER TABLE "afiliaciones" ADD COLUMN     "cargo" TEXT,
ADD COLUMN     "tipoSalario" TEXT DEFAULT 'BASICO';

-- AlterTable
ALTER TABLE "cotizantes" ADD COLUMN     "estadoCivil" TEXT;

-- AlterTable
ALTER TABLE "empresa_nivel_riesgo" ADD COLUMN     "colpatriaCentroTrabajo" TEXT;

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "colpatriaAfiliacionId" TEXT,
ADD COLUMN     "colpatriaAplicacion" TEXT DEFAULT 'ARP',
ADD COLUMN     "colpatriaCodigoSucursalDefault" TEXT,
ADD COLUMN     "colpatriaEmpresaIdInterno" TEXT,
ADD COLUMN     "colpatriaGrupoOcupacionDefault" TEXT,
ADD COLUMN     "colpatriaModalidadTrabajoDefault" TEXT,
ADD COLUMN     "colpatriaPerfil" TEXT DEFAULT 'OFI',
ADD COLUMN     "colpatriaTipoAfiliacionDefault" TEXT,
ADD COLUMN     "colpatriaTipoOcupacionDefault" TEXT;
