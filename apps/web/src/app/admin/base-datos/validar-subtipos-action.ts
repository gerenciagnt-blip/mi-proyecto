'use server';

/**
 * Sprint Soporte reorg fase 2 — Action que orquesta la validación de
 * subtipos de cotizante contra PagoSimple. Se llama desde el form de
 * Nueva afiliación (modalidad DEPENDIENTE) junto al botón BDUA/RUAF.
 *
 * Flujo:
 *   1. Resolver "empresa host" para el plano sintético: primera empresa
 *      activa con `pagosimpleContributorId` de la sucursal del usuario.
 *      Si no hay → cualquier empresa del sistema con sync (Q8).
 *   2. Resolver entidades SGSS del cotizante:
 *      a) Internamente llamar BDUA/RUAF (Q4.b).
 *      b) Si BDUA/RUAF está vacío → usar defaults del catálogo y avisar (Q4.c).
 *   3. Resolver departamento/municipio del cotizante (con fallback a la
 *      empresa o a Bogotá).
 *   4. Llamar `validarSubtiposCotizanteEnPagosimple` y devolver el
 *      resultado.
 *
 * Read-only en BD — no persiste nada (Q7).
 */

import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { consultarCotizanteBduaRuaf } from '@/lib/pagosimple/bdua-ruaf';
import {
  validarSubtiposCotizanteEnPagosimple,
  SUBTIPOS_OMISION_PENSION,
  type ValidarSubtiposResult,
} from '@/lib/pagosimple/validar-subtipos';

export type ValidarSubtiposActionResult =
  | {
      ok: true;
      /** Lista de subtipos PILA válidos para esta persona (sin errores PagoSimple). */
      validos: string[];
      /** Detalle de subtipos rechazados con razón. */
      rechazados: Array<{ subtipo: string; razon: string }>;
      /** Empresa que se usó como "host" del plano sintético. */
      empresaUsada: { id: string; nombre: string; nit: string };
      /** Indica si los datos SGSS vinieron de BDUA/RUAF o se usaron defaults. */
      fuenteEntidades: 'BDUA' | 'DEFAULT';
      /** Aviso opcional al usuario (ej: "BDUA vacío, usando defaults"). */
      aviso?: string;
    }
  | { ok: false; error: string };

export async function validarSubtiposCotizanteAction(input: {
  tipoDocumento: string;
  numeroDocumento: string;
  /** Datos del cotizante que ya está llenando (opcional — si vienen, se
   *  usan; si no, se completan con defaults). */
  primerNombre?: string;
  segundoNombre?: string | null;
  primerApellido?: string;
  segundoApellido?: string | null;
}): Promise<ValidarSubtiposActionResult> {
  await requireAuth();
  const scope = await getUserScope();
  if (!scope) return { ok: false, error: 'Sesión inválida' };

  // ============ 1) Empresa host ============
  // Primero buscamos en la sucursal del usuario (si la tiene) — es la
  // política natural según Q2(a). Si no aparece ninguna sincronizada,
  // caemos a CUALQUIER empresa con pagosimpleContributorId del sistema
  // como fallback (Q8 — "intentar con otra empresa").
  //
  // NOTA: Empresa es global, no scopeada por sucursal en el modelo.
  // El "criterio de sucursal" del Q2 lo aplicamos vía UsuarioEmpresa
  // — empresas a las que el aliado tiene acceso. Para STAFF tomamos
  // la primera global.
  const empresaInclude = {
    arl: { select: { codigo: true, codigoMinSalud: true } },
    departamentoRef: { select: { codigo: true } },
    municipioRef: { select: { codigo: true } },
  } as const;

  const empresaWhereBase = {
    active: true,
    pagosimpleContributorId: { not: null },
    arl: { isNot: null },
  } as const;

  let empresa: Awaited<
    ReturnType<typeof prisma.empresa.findFirst<{ include: typeof empresaInclude }>>
  > | null = null;

  if (scope.tipo === 'SUCURSAL') {
    // Empresas a las que este aliado tiene acceso explícito.
    const accesos = await prisma.usuarioEmpresa.findMany({
      where: {
        // No tenemos sucursalId directo en UsuarioEmpresa — vamos vía
        // user → sucursal. Filtramos por usuarios cuya sucursalId
        // coincide con scope.sucursalId.
        user: { sucursalId: scope.sucursalId },
      },
      select: { empresaId: true },
    });
    const empresaIds = accesos.map((a) => a.empresaId);
    if (empresaIds.length > 0) {
      empresa = await prisma.empresa.findFirst({
        where: { ...empresaWhereBase, id: { in: empresaIds } },
        include: empresaInclude,
        orderBy: { createdAt: 'asc' },
      });
    }
  } else {
    // STAFF: cualquier empresa del sistema.
    empresa = await prisma.empresa.findFirst({
      where: empresaWhereBase,
      include: empresaInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  // Fallback Q8: si en la sucursal no hay, intentar con cualquier otra.
  if (!empresa) {
    empresa = await prisma.empresa.findFirst({
      where: empresaWhereBase,
      include: empresaInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!empresa || !empresa.pagosimpleContributorId || !empresa.arl) {
    return {
      ok: false,
      error:
        'No hay ninguna empresa sincronizada con PagoSimple en el sistema. ' +
        'Sincroniza al menos una desde /admin/empresas para poder validar subtipos.',
    };
  }
  const arlInfo = empresa.arl;

  // ============ 2) Entidades SGSS del cotizante ============
  let codEps = '';
  let codAfp = '';
  let codCcf = '';
  let fuenteEntidades: 'BDUA' | 'DEFAULT' = 'DEFAULT';
  let aviso: string | undefined;

  try {
    const bdua = await consultarCotizanteBduaRuaf(input.tipoDocumento, input.numeroDocumento);
    if (bdua) {
      // BDUA usa `bdua_eps_code` (MinSalud); RUAF `ruaf_afp_code`.
      // Mapeamos al `codigoMinSalud` del catálogo local.
      const epsCodMin = bdua.bdua_eps_code?.trim() ?? '';
      const afpCodMin = bdua.ruaf_afp_code?.trim() ?? '';
      if (epsCodMin || afpCodMin) {
        const [eps, afp] = await Promise.all([
          epsCodMin
            ? prisma.entidadSgss.findFirst({
                where: { tipo: 'EPS', codigoMinSalud: epsCodMin, active: true },
                select: { codigo: true, codigoMinSalud: true },
              })
            : Promise.resolve(null),
          afpCodMin
            ? prisma.entidadSgss.findFirst({
                where: { tipo: 'AFP', codigoMinSalud: afpCodMin, active: true },
                select: { codigo: true, codigoMinSalud: true },
              })
            : Promise.resolve(null),
        ]);
        codEps = eps?.codigoMinSalud ?? eps?.codigo ?? epsCodMin;
        codAfp = afp?.codigoMinSalud ?? afp?.codigo ?? afpCodMin;
        if (codEps || codAfp) fuenteEntidades = 'BDUA';
      }
    }
  } catch (err) {
    // BDUA falló — no es bloqueante, caemos a defaults.
    aviso = `BDUA/RUAF no respondió. Usando entidades default: ${err instanceof Error ? err.message : 'error'}`;
  }

  // Fallback: cualquier EPS/AFP/CCF activa del catálogo si BDUA no llenó.
  if (!codEps) {
    const eps = await prisma.entidadSgss.findFirst({
      where: { tipo: 'EPS', active: true },
      orderBy: { codigo: 'asc' },
      select: { codigo: true, codigoMinSalud: true },
    });
    codEps = eps?.codigoMinSalud ?? eps?.codigo ?? '';
  }
  if (!codAfp) {
    const afp = await prisma.entidadSgss.findFirst({
      where: { tipo: 'AFP', active: true },
      orderBy: { codigo: 'asc' },
      select: { codigo: true, codigoMinSalud: true },
    });
    codAfp = afp?.codigoMinSalud ?? afp?.codigo ?? '';
  }
  if (!codCcf) {
    const ccf = await prisma.entidadSgss.findFirst({
      where: { tipo: 'CCF', active: true },
      orderBy: { codigo: 'asc' },
      select: { codigo: true, codigoMinSalud: true },
    });
    codCcf = ccf?.codigoMinSalud ?? ccf?.codigo ?? '';
  }

  if (fuenteEntidades === 'DEFAULT' && !aviso) {
    aviso =
      'El cotizante no tiene registros en BDUA/RUAF. Se usaron entidades default del catálogo para la validación.';
  }

  // ============ 3) Sucursal y datos cotizante ============
  let sucursalCodigo = 'PRUEBA';
  let sucursalNombre = 'Validación subtipos';
  if (scope.tipo === 'SUCURSAL') {
    const suc = await prisma.sucursal.findUnique({
      where: { id: scope.sucursalId },
      select: { codigo: true, nombre: true },
    });
    if (suc) {
      sucursalCodigo = suc.codigo;
      sucursalNombre = suc.nombre;
    }
  }

  // Departamento/municipio: usamos los de la empresa por simplicidad.
  // Si la empresa no los tiene, defaulteamos a Bogotá (11/001).
  const codDepto = empresa.departamentoRef?.codigo ?? '11';
  const codMuni = empresa.municipioRef?.codigo ?? '001';

  // ============ 4) Llamar PagoSimple ============
  const result: ValidarSubtiposResult = await validarSubtiposCotizanteEnPagosimple({
    empresa: {
      pagosimpleContributorId: empresa.pagosimpleContributorId!,
      nit: empresa.nit,
      dv: empresa.dv,
      nombre: empresa.nombre,
      codArl: arlInfo.codigoMinSalud ?? arlInfo.codigo,
      exoneraLey1607: empresa.exoneraLey1607,
    },
    sucursal: {
      codigo: sucursalCodigo,
      nombre: sucursalNombre,
    },
    cotizante: {
      tipoDocumento: input.tipoDocumento,
      numeroDocumento: input.numeroDocumento,
      primerNombre: (input.primerNombre || 'COTIZANTE').toUpperCase(),
      segundoNombre: (input.segundoNombre ?? null)?.toUpperCase() ?? null,
      primerApellido: (input.primerApellido || 'PRUEBA').toUpperCase(),
      segundoApellido: (input.segundoApellido ?? null)?.toUpperCase() ?? null,
      codDepto,
      codMuni,
      codEps,
      codAfp,
      codCcf,
    },
    subtipos: SUBTIPOS_OMISION_PENSION,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    validos: result.validos,
    rechazados: result.rechazados.map((r) => ({
      subtipo: r.subtipo,
      razon: r.errores[0] ?? 'Sin descripción del operador',
    })),
    empresaUsada: { id: empresa.id, nombre: empresa.nombre, nit: empresa.nit },
    fuenteEntidades,
    aviso,
  };
}
