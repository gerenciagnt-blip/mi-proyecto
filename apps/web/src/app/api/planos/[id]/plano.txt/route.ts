import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth-helpers';
import { generarPlano } from '@/lib/planos/generar';
import { cargarPlanillaParaPlano, cotizantesConMensualidadPrevia } from '@/lib/planos/queries';

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
 *
 * Restricción de roles: solo ADMIN y SOPORTE pueden descargar el TXT —
 * los aliados no manejan el archivo plano directamente. `requireStaff`
 * redirige al login si la sesión no cumple, así que el chequeo cubre
 * tanto la UI (que oculta el botón) como cualquier intento de manipular
 * la URL directamente.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const planilla = await cargarPlanillaParaPlano(id);

  if (!planilla) {
    return NextResponse.json({ error: 'Planilla no existe' }, { status: 404 });
  }
  if (planilla.estado === 'ANULADA') {
    return NextResponse.json({ error: 'Planilla anulada — plano no disponible' }, { status: 410 });
  }

  // Un cotizante es "primera mensualidad" si NO tiene otra mensualidad
  // procesada fuera de esta planilla. La regla está en queries.ts.
  const cotizanteIds = Array.from(
    new Set(
      planilla.comprobantes
        .flatMap((cp) => cp.comprobante.liquidaciones)
        .map((cl) => cl.liquidacion.afiliacion.cotizante.id),
    ),
  );
  const comprobanteIdsPlanilla = planilla.comprobantes.map((cp) => cp.comprobanteId);
  const conMensualidadPrevia = await cotizantesConMensualidadPrevia(
    cotizanteIds,
    comprobanteIdsPlanilla,
  );

  try {
    const { contenido, filename } = generarPlano(planilla, conMensualidadPrevia);
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
