import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { generarPlano } from '@/lib/planos/generar';

export const dynamic = 'force-dynamic';

/**
 * GET /api/planos/[id]/plano.txt — descarga el archivo plano PILA de la
 * planilla. Respeta el formato de la resolución 2388/2016:
 *   - Encabezado 359 bytes (registro tipo 01)
 *   - Una línea por cotizante de 693 bytes (676 oficial + 17 padding
 *     operador)
 *   - Separador de líneas CRLF (\r\n)
 *
 * Solo se permite descargar planillas CONSOLIDADO o PAGADA (las ANULADAS
 * no).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;

  const planilla = await prisma.planilla.findUnique({
    where: { id },
    include: {
      periodo: true,
      empresa: {
        include: {
          departamentoRef: { select: { codigo: true } },
          municipioRef: { select: { codigo: true } },
          arl: { select: { codigo: true } },
        },
      },
      cotizante: {
        include: {
          departamento: { select: { codigo: true } },
          municipio: { select: { codigo: true } },
        },
      },
      comprobantes: {
        include: {
          comprobante: {
            include: {
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
                              arl: { select: { codigo: true } },
                            },
                          },
                          eps: { select: { codigo: true } },
                          afp: { select: { codigo: true } },
                          arl: { select: { codigo: true } },
                          ccf: { select: { codigo: true } },
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
    return NextResponse.json(
      { error: 'Planilla anulada — plano no disponible' },
      { status: 410 },
    );
  }

  try {
    const { contenido, filename } = generarPlano(planilla);
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
