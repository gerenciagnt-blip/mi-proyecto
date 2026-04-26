import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { ESTADO_CONSOLIDADO_LABEL, ESTADO_LINEA_LABEL } from '@/lib/cartera/labels';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cartera/[id]/export.xlsx — exporta un consolidado completo a
 * Excel para que soporte / contables puedan trabajarlo offline o enviarlo
 * a la entidad.
 *
 * El archivo trae 2 hojas:
 *   - "Cabecera": una sola fila con los datos del consolidado (entidad,
 *     empresa, período, totales, estado, etc.).
 *   - "Detalle": una fila por cada línea del consolidado (cotizante,
 *     período de cobro, valor, estado de la línea, sucursal asignada,
 *     última gestión).
 *
 * Solo staff (ADMIN/SOPORTE). El aliado tiene sus propios reportes desde
 * Administrativo · Cartera, donde solo ve sus líneas.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const consolidado = await prisma.carteraConsolidado.findUnique({
    where: { id },
    include: {
      empresa: { select: { nombre: true, nit: true } },
      createdBy: { select: { name: true, email: true } },
      detallado: {
        orderBy: [{ nombreCompleto: 'asc' }, { periodoCobro: 'asc' }],
        include: {
          sucursalAsignada: { select: { codigo: true, nombre: true } },
          // Última gestión para la columna de seguimiento.
          gestiones: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true, descripcion: true, accionadaPor: true },
          },
        },
      },
    },
  });

  if (!consolidado) {
    return NextResponse.json({ error: 'Consolidado no existe' }, { status: 404 });
  }

  // ============ Hoja 1: Cabecera ============
  const cabeceraRow = {
    Consecutivo: consolidado.consecutivo,
    'Fecha registro': consolidado.fechaRegistro.toISOString().slice(0, 10),
    'Tipo entidad': consolidado.tipoEntidad,
    Entidad: consolidado.entidadNombre,
    'NIT entidad': consolidado.entidadNit ?? '',
    Empresa: consolidado.empresa?.nombre ?? consolidado.empresaRazonSocial,
    'NIT empresa': consolidado.empresaNit,
    'Período desde': consolidado.periodoDesde ?? '',
    'Período hasta': consolidado.periodoHasta ?? '',
    'Cantidad líneas': consolidado.cantidadRegistros,
    'Valor total informado': Number(consolidado.valorTotalInformado),
    Estado: ESTADO_CONSOLIDADO_LABEL[consolidado.estado],
    'Origen PDF': consolidado.origenPdf ?? 'MANUAL',
    'Cargado por': consolidado.createdBy?.name ?? '',
    Observaciones: consolidado.observaciones ?? '',
  };
  const wsCabecera = XLSX.utils.json_to_sheet([cabeceraRow]);
  // Ancho de columnas legibles
  wsCabecera['!cols'] = [
    { wch: 14 }, // Consecutivo
    { wch: 14 }, // Fecha
    { wch: 12 }, // Tipo entidad
    { wch: 30 }, // Entidad
    { wch: 14 }, // NIT entidad
    { wch: 30 }, // Empresa
    { wch: 14 }, // NIT empresa
    { wch: 14 }, // Período desde
    { wch: 14 }, // Período hasta
    { wch: 14 }, // Cantidad líneas
    { wch: 18 }, // Valor total
    { wch: 14 }, // Estado
    { wch: 14 }, // Origen PDF
    { wch: 24 }, // Cargado por
    { wch: 40 }, // Observaciones
  ];

  // ============ Hoja 2: Detalle ============
  const detalleRows = consolidado.detallado.map((d) => ({
    'Tipo doc.': d.tipoDocumento,
    'Número doc.': d.numeroDocumento,
    'Nombre completo': d.nombreCompleto,
    'Período de cobro': d.periodoCobro,
    Valor: Number(d.valorCobro),
    IBC: d.ibc ? Number(d.ibc) : '',
    Novedad: d.novedad ?? '',
    Estado: ESTADO_LINEA_LABEL[d.estado],
    'Sucursal asignada': d.sucursalAsignada
      ? `${d.sucursalAsignada.codigo} — ${d.sucursalAsignada.nombre}`
      : '',
    'Última gestión': d.gestiones[0]?.createdAt
      ? d.gestiones[0].createdAt.toISOString().slice(0, 10)
      : '',
    'Última gestión por': d.gestiones[0]?.accionadaPor ?? '',
    'Última gestión descripción': d.gestiones[0]?.descripcion ?? '',
    Observaciones: d.observaciones ?? '',
    'Match cotizante BD': d.cotizanteId ? 'Sí' : 'No',
  }));
  const wsDetalle = XLSX.utils.json_to_sheet(detalleRows);
  wsDetalle['!cols'] = [
    { wch: 10 }, // Tipo doc.
    { wch: 16 }, // Número doc.
    { wch: 32 }, // Nombre completo
    { wch: 14 }, // Período de cobro
    { wch: 16 }, // Valor
    { wch: 14 }, // IBC
    { wch: 12 }, // Novedad
    { wch: 16 }, // Estado
    { wch: 28 }, // Sucursal asignada
    { wch: 14 }, // Última gestión
    { wch: 12 }, // Última gestión por
    { wch: 40 }, // Última gestión descripción
    { wch: 30 }, // Observaciones
    { wch: 10 }, // Match cotizante BD
  ];

  // ============ Workbook ============
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsCabecera, 'Cabecera');
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const filename = `${consolidado.consecutivo}.xlsx`;

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
