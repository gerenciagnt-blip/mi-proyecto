import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { generarPlantillaCsv } from '@/lib/cotizantes/csv-import';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cotizantes/template.csv — descarga la plantilla CSV con el
 * header esperado y una fila de ejemplo para que el aliado importe sus
 * cotizantes en bulk.
 */
export async function GET() {
  await requireAuth();
  const csv = generarPlantillaCsv();
  // BOM al inicio para que Excel detecte UTF-8 y no rompa los acentos.
  const withBom = `﻿${csv}`;
  return new NextResponse(withBom, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-cotizantes.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
