import { Prisma, prisma } from '@pila/db';

/**
 * Includes y queries compartidos para cargar una planilla con todo el
 * contexto que necesita el generador del archivo plano PILA.
 *
 * El include es masivo (5+ niveles de profundidad) porque el TXT necesita
 * datos de la afiliación, el cotizante, la empresa, las entidades SGSS,
 * los conceptos de liquidación, la actividad económica, etc. Antes vivía
 * duplicado en `app/api/planos/[id]/plano.txt/route.ts` y en
 * `lib/pagosimple/planillas.ts` — ambos resolvían lo mismo de forma
 * idéntica, lo que causaba drift cuando se agregaba un campo.
 *
 * Si necesitás extender la query (ej. nuevo campo en el TXT que requiere
 * un nuevo `include`), hacelo acá una sola vez. El tipo `PlanillaConDatos`
 * en `generar.ts` se mantiene en sync porque ese refleja el shape del
 * resultado de esta query.
 */

/**
 * Forma exacta del `include` que usa la query. Lo exponemos como const
 * tipado para que cualquiera que necesite la misma forma pueda hacer
 * `prisma.planilla.findUnique({ where: ..., include: PLANILLA_PARA_PLANO_INCLUDE })`.
 */
export const PLANILLA_PARA_PLANO_INCLUDE = {
  periodo: true,
  empresa: {
    include: {
      departamentoRef: { select: { codigo: true } },
      municipioRef: { select: { codigo: true } },
      arl: { select: { codigo: true, codigoMinSalud: true } },
    },
  },
  cotizante: {
    include: {
      departamento: { select: { codigo: true } },
      municipio: { select: { codigo: true } },
    },
  },
  sucursal: { select: { codigo: true, nombre: true } },
  createdBy: {
    include: {
      sucursal: { select: { codigo: true, nombre: true } },
    },
  },
  comprobantes: {
    include: {
      comprobante: {
        include: {
          cuentaCobro: {
            include: {
              sucursal: { select: { codigo: true, nombre: true } },
            },
          },
          liquidaciones: {
            include: {
              liquidacion: {
                include: {
                  afiliacion: {
                    include: {
                      cotizante: {
                        include: {
                          departamento: { select: { codigo: true } },
                          municipio: { select: { codigo: true } },
                        },
                      },
                      empresa: {
                        include: {
                          departamentoRef: { select: { codigo: true } },
                          municipioRef: { select: { codigo: true } },
                          arl: { select: { codigo: true, codigoMinSalud: true } },
                        },
                      },
                      tipoCotizante: { select: { codigo: true } },
                      subtipo: { select: { codigo: true } },
                      planSgss: {
                        select: {
                          incluyeEps: true,
                          incluyeAfp: true,
                          incluyeArl: true,
                          incluyeCcf: true,
                        },
                      },
                      actividadEconomica: { select: { codigoCiiu: true } },
                      eps: { select: { codigo: true, codigoMinSalud: true } },
                      afp: { select: { codigo: true, codigoMinSalud: true } },
                      arl: { select: { codigo: true, codigoMinSalud: true } },
                      ccf: { select: { codigo: true, codigoMinSalud: true } },
                    },
                  },
                  conceptos: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PlanillaInclude;

/**
 * Carga una planilla con todo el contexto necesario para generar el TXT
 * o subirlo a PagoSimple. Retorna `null` si la planilla no existe.
 *
 * Usar este helper en vez de copiar el include — si el shape cambia, todos
 * los consumidores se actualizan automáticamente.
 */
export async function cargarPlanillaParaPlano(planillaId: string) {
  return prisma.planilla.findUnique({
    where: { id: planillaId },
    include: PLANILLA_PARA_PLANO_INCLUDE,
  });
}

/**
 * Para una lista de cotizantes, busca cuáles ya tienen alguna mensualidad
 * procesada en otra planilla. Se usa para marcar el flag ING en la línea
 * cotizante: solo los que NO tienen historia previa son "primera mensualidad".
 *
 * `comprobanteIdsExcluir` es la lista de comprobantes de la planilla actual
 * — los excluimos para no contar la planilla en cuestión como "previa".
 */
export async function cotizantesConMensualidadPrevia(
  cotizanteIds: string[],
  comprobanteIdsExcluir: string[],
): Promise<Set<string>> {
  if (cotizanteIds.length === 0) return new Set();

  const liqsPrevias = await prisma.liquidacion.findMany({
    where: {
      tipo: 'MENSUALIDAD',
      afiliacion: { cotizanteId: { in: cotizanteIds } },
      comprobantes: {
        some: {
          comprobante: {
            estado: { not: 'ANULADO' },
            procesadoEn: { not: null },
            id: { notIn: comprobanteIdsExcluir },
          },
        },
      },
    },
    select: { afiliacion: { select: { cotizanteId: true } } },
  });

  return new Set(
    liqsPrevias.map((l) => l.afiliacion.cotizanteId).filter((x): x is string => x != null),
  );
}
