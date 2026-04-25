import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { generarPlano } from '@/lib/planos/generar';

export const dynamic = 'force-dynamic';

/**
 * GET /api/planos/[id]/plano.txt — descarga el archivo plano PILA de la
 * planilla. Respeta el formato de la resolución 2388/2016:
 *   - Encabezado 359 bytes (registro tipo 01)
 *   - Una línea por cotizante de 693 bytes (676 oficial + 17 padding con
 *     actividad económica del operador).
 *   - Separador CRLF (\r\n).
 *
 * Solo se permite descargar planillas CONSOLIDADO o PAGADA.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;

  const planilla = await prisma.planilla.findUnique({
    where: { id },
    include: {
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
    },
  });

  if (!planilla) {
    return NextResponse.json({ error: 'Planilla no existe' }, { status: 404 });
  }
  if (planilla.estado === 'ANULADA') {
    return NextResponse.json({ error: 'Planilla anulada — plano no disponible' }, { status: 410 });
  }

  // Scope: un aliado sólo puede descargar sus planillas.
  const scope = await getUserScope();
  if (!scope) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
  }
  if (scope.tipo === 'SUCURSAL' && planilla.sucursalId !== scope.sucursalId) {
    return NextResponse.json({ error: 'No tienes permiso sobre esta planilla' }, { status: 403 });
  }

  // ----- Query de mensualidades previas para marcar ING -----
  // Un cotizante es "primera mensualidad" si NO tiene otra mensualidad
  // procesada fuera de esta planilla. Se busca a través de las
  // liquidaciones (porque un comprobante EMPRESA_CC puede tener el
  // cotizanteId en null pero la liquidación sí lo referencia).
  const cotizanteIds = Array.from(
    new Set(
      planilla.comprobantes
        .flatMap((cp) => cp.comprobante.liquidaciones)
        .map((cl) => cl.liquidacion.afiliacion.cotizante.id),
    ),
  );
  const comprobanteIdsPlanilla = planilla.comprobantes.map((cp) => cp.comprobanteId);

  let cotizantesConMensualidadPrevia = new Set<string>();
  if (cotizanteIds.length > 0) {
    const liqsPrevias = await prisma.liquidacion.findMany({
      where: {
        tipo: 'MENSUALIDAD',
        afiliacion: { cotizanteId: { in: cotizanteIds } },
        comprobantes: {
          some: {
            comprobante: {
              estado: { not: 'ANULADO' },
              procesadoEn: { not: null },
              id: { notIn: comprobanteIdsPlanilla },
            },
          },
        },
      },
      select: { afiliacion: { select: { cotizanteId: true } } },
    });
    cotizantesConMensualidadPrevia = new Set(
      liqsPrevias.map((l) => l.afiliacion.cotizanteId).filter((x): x is string => x != null),
    );
  }

  try {
    const { contenido, filename } = generarPlano(planilla, cotizantesConMensualidadPrevia);
    return new NextResponse(contenido, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error generando plano';
    console.error('[plano.txt]', mensaje, err);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
