import type { EmpresaConfigSnapshot, NivelRiesgo } from '@pila/core';

/**
 * Adapter del shape devuelto por Prisma (con prefijos `colpatria*` y la
 * relación `nivelesPermitidos`) al `EmpresaConfigSnapshot` neutral que
 * espera el resolver en `@pila/core`.
 *
 * El bot consulta empresa con `select` directo a las columnas del schema
 * (sin transformar nombres) porque los queries de Prisma se ven mejor
 * así. El adapter vive aquí, en bot-only, para que el resolver no tenga
 * que conocer los nombres reales de columnas de Prisma.
 */
export type EmpresaPrismaSnapshot = {
  nit: string;
  colpatriaAplicacion: string | null;
  colpatriaPerfil: string | null;
  colpatriaEmpresaIdInterno: string | null;
  colpatriaAfiliacionId: string | null;
  colpatriaCodigoSucursalDefault: string | null;
  colpatriaTipoAfiliacionDefault: string | null;
  colpatriaGrupoOcupacionDefault: string | null;
  colpatriaTipoOcupacionDefault: string | null;
  nivelesPermitidos: Array<{
    nivel: string;
    colpatriaCentroTrabajo: string | null;
    colpatriaGrupoOcupacion: string | null;
    colpatriaTipoOcupacion: string | null;
  }>;
};

/** Convierte el shape de query del bot al snapshot neutral del resolver. */
export function toConfigSnapshot(empresa: EmpresaPrismaSnapshot): EmpresaConfigSnapshot {
  return {
    nit: empresa.nit,
    colpatriaAplicacion: empresa.colpatriaAplicacion,
    colpatriaPerfil: empresa.colpatriaPerfil,
    colpatriaEmpresaIdInterno: empresa.colpatriaEmpresaIdInterno,
    colpatriaAfiliacionId: empresa.colpatriaAfiliacionId,
    colpatriaCodigoSucursalDefault: empresa.colpatriaCodigoSucursalDefault,
    colpatriaTipoAfiliacionDefault: empresa.colpatriaTipoAfiliacionDefault,
    colpatriaGrupoOcupacionDefault: empresa.colpatriaGrupoOcupacionDefault,
    colpatriaTipoOcupacionDefault: empresa.colpatriaTipoOcupacionDefault,
    nivelesCentros: empresa.nivelesPermitidos.map((n) => ({
      nivel: n.nivel as NivelRiesgo,
      codigoCentroTrabajo: n.colpatriaCentroTrabajo,
      grupoOcupacion: n.colpatriaGrupoOcupacion,
      tipoOcupacion: n.colpatriaTipoOcupacion,
    })),
  };
}
