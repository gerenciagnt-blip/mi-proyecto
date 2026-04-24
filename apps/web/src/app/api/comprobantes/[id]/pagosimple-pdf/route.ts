import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { isPagosimpleEnabled } from '@/lib/pagosimple/config';
import { fetchComprobantePagoSimple } from '@/lib/pagosimple/comprobantes';

/**
 * GET /api/comprobantes/[id]/pagosimple-pdf
 *
 * Descarga el comprobante oficial generado por PagoSimple para este
 * comprobante interno. Lo distingue del PDF local (`/pdf`) que usa
 * nuestro renderer interno.
 *
 * Flujo:
 *   - Auth + scope (misma semántica que /pdf — la sucursal solo ve los suyos).
 *   - Llama a `fetchComprobantePagoSimple` que:
 *       1. Valida agrupación INDIVIDUAL + cotizante presente
 *       2. Toma el payroll_number de una planilla activa
 *       3. POST /voucher/report-types → PDF base64
 *   - Devuelve el PDF como stream descargable.
 *
 * Query param opcional:
 *   ?report_type=1  → prefactura (antes de pagar)
 *   ?report_type=2  → comprobante pagado (default)
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;

  if (!isPagosimpleEnabled()) {
    return NextResponse.json(
      { error: 'La integración con PagoSimple no está configurada.' },
      { status: 503 },
    );
  }

  // Scope check — mismo criterio que /api/comprobantes/[id]/pdf
  const comp = await prisma.comprobante.findUnique({
    where: { id },
    select: {
      estado: true,
      cotizante: { select: { sucursalId: true } },
      cuentaCobro: { select: { sucursalId: true } },
      asesorComercial: { select: { sucursalId: true } },
    },
  });
  if (!comp) {
    return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 });
  }

  const scope = await getUserScope();
  if (!scope) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
  }
  if (scope.tipo === 'SUCURSAL') {
    const mia = scope.sucursalId;
    const permitido =
      (comp.cotizante && comp.cotizante.sucursalId === mia) ||
      (comp.cuentaCobro && comp.cuentaCobro.sucursalId === mia) ||
      (comp.asesorComercial &&
        (comp.asesorComercial.sucursalId === null || comp.asesorComercial.sucursalId === mia));
    if (!permitido) {
      return NextResponse.json(
        { error: 'No tienes permiso sobre este comprobante' },
        { status: 403 },
      );
    }
  }

  // report_type: 1=prefactura, 2=comprobante (default)
  const url = new URL(req.url);
  const rtRaw = url.searchParams.get('report_type');
  const reportType: '1' | '2' = rtRaw === '1' ? '1' : '2';

  const res = await fetchComprobantePagoSimple(id, { reportType });
  if (!res.ok) {
    const status = res.code && res.code >= 400 && res.code < 600 ? res.code : 502;
    return NextResponse.json({ error: res.error }, { status });
  }

  return new NextResponse(new Uint8Array(res.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${res.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
