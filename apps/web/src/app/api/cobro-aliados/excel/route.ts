/**
 * GET /api/cobro-aliados/excel?anio=2026&mes=5
 *
 * Descarga un Excel con todos los cobros de aliados de un período
 * contable. Útil para conciliación financiera mensual: cuántos cobros
 * se generaron, cuáles están pagados (manual / Efipay) y cuánto se ha
 * recaudado.
 *
 * Hoja 1 "Cobros": una fila por CobroAliado con sucursal, montos,
 *   estado, fecha pago, medio de pago, referencia. Si tiene transacción
 *   Efipay, se incluyen las columnas de la pasarela.
 * Hoja 2 "Resumen": agregados — cantidad pendiente/pagada/vencida,
 *   total recaudado por medio de pago (incl. Efipay), por sucursal.
 *
 * Solo staff (ADMIN/SOPORTE).
 */

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  PAGADO: 'Pagado',
  VENCIDO: 'Vencido',
  ANULADO: 'Anulado',
};

export async function GET(request: Request) {
  await requireStaff();

  const url = new URL(request.url);
  const anioParam = url.searchParams.get('anio');
  const mesParam = url.searchParams.get('mes');

  // Default: período en curso
  const ahora = new Date();
  const anio = anioParam ? Number(anioParam) : ahora.getFullYear();
  const mes = mesParam ? Number(mesParam) : ahora.getMonth() + 1;

  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) {
    return NextResponse.json({ error: 'Año inválido' }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'Mes inválido' }, { status: 400 });
  }

  const periodo = await prisma.periodoContable.findUnique({
    where: { anio_mes: { anio, mes } },
  });
  if (!periodo) {
    return NextResponse.json(
      { error: `No existe período contable ${anio}-${String(mes).padStart(2, '0')}` },
      { status: 404 },
    );
  }

  const cobros = await prisma.cobroAliado.findMany({
    where: { periodoId: periodo.id },
    orderBy: [{ sucursal: { codigo: 'asc' } }, { consecutivo: 'asc' }],
    include: {
      sucursal: { select: { codigo: true, nombre: true } },
      medioPago: { select: { nombre: true } },
      efipayTransacciones: {
        orderBy: { iniciadaEn: 'desc' },
        select: {
          estado: true,
          montoBase: true,
          sobrecosto: true,
          montoCobrado: true,
          efipayPaymentId: true,
          aprobadaEn: true,
          rechazadaEn: true,
          iniciadaEn: true,
          intentosWebhook: true,
        },
      },
    },
  });

  // --- Construir Excel ---
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema PILA';
  wb.created = new Date();

  // ============================================
  // Hoja 1 — Cobros
  // ============================================
  const ws = wb.addWorksheet('Cobros');

  ws.columns = [
    { header: 'Consecutivo', key: 'consecutivo', width: 14 },
    { header: 'Cód. sucursal', key: 'codigoSucursal', width: 14 },
    { header: 'Sucursal', key: 'nombreSucursal', width: 30 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Cant. afiliaciones', key: 'cantAfiliaciones', width: 12 },
    { header: 'Cant. mensualidades', key: 'cantMensualidades', width: 12 },
    { header: 'Valor afiliaciones', key: 'valorAfiliaciones', width: 16 },
    { header: 'Valor mensualidades', key: 'valorMensualidades', width: 16 },
    { header: 'Total cobro', key: 'totalCobro', width: 16 },
    { header: 'Fecha generado', key: 'fechaGenerado', width: 12 },
    { header: 'Fecha límite', key: 'fechaLimite', width: 12 },
    { header: 'Fecha pagado', key: 'fechaPagado', width: 12 },
    { header: 'Medio pago', key: 'medioPago', width: 18 },
    { header: 'Referencia pago', key: 'referenciaPago', width: 24 },
    { header: 'Pagó por Efipay', key: 'pagoEfipay', width: 12 },
    { header: 'Sobrecosto Efipay', key: 'sobrecostoEfipay', width: 14 },
    { header: 'Total cobrado al aliado', key: 'totalCobradoAliado', width: 16 },
    { header: 'Payment ID Efipay', key: 'paymentIdEfipay', width: 36 },
  ];

  // Estilo header
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  ws.getRow(1).height = 28;

  let totalGenerado = 0;
  let totalRecaudado = 0;
  let cantPagadosEfipay = 0;
  let totalSobrecostoEfipay = 0;

  for (const c of cobros) {
    const trxAprobada = c.efipayTransacciones.find((t) => t.estado === 'APROBADA');
    const totalCobradoAliado = trxAprobada
      ? Number(trxAprobada.montoCobrado)
      : c.estado === 'PAGADO'
        ? Number(c.totalCobro)
        : 0;

    if (trxAprobada) {
      cantPagadosEfipay++;
      totalSobrecostoEfipay += Number(trxAprobada.sobrecosto);
    }
    totalGenerado += Number(c.totalCobro);
    if (c.estado === 'PAGADO') totalRecaudado += Number(c.totalCobro);

    const row = ws.addRow({
      consecutivo: c.consecutivo,
      codigoSucursal: c.sucursal.codigo,
      nombreSucursal: c.sucursal.nombre,
      estado: ESTADO_LABEL[c.estado] ?? c.estado,
      cantAfiliaciones: c.cantAfiliaciones,
      cantMensualidades: c.cantMensualidades,
      valorAfiliaciones: Number(c.valorAfiliaciones),
      valorMensualidades: Number(c.valorMensualidades),
      totalCobro: Number(c.totalCobro),
      fechaGenerado: c.fechaGenerado.toISOString().slice(0, 10),
      fechaLimite: c.fechaLimite.toISOString().slice(0, 10),
      fechaPagado: c.fechaPagado ? c.fechaPagado.toISOString().slice(0, 10) : '',
      medioPago: c.medioPago?.nombre ?? (trxAprobada ? 'Efipay' : ''),
      referenciaPago: c.referenciaPago ?? '',
      pagoEfipay: trxAprobada ? 'Sí' : '',
      sobrecostoEfipay: trxAprobada ? Number(trxAprobada.sobrecosto) : '',
      totalCobradoAliado: totalCobradoAliado || '',
      paymentIdEfipay: trxAprobada?.efipayPaymentId ?? '',
    });

    // Formato moneda
    [
      'valorAfiliaciones',
      'valorMensualidades',
      'totalCobro',
      'sobrecostoEfipay',
      'totalCobradoAliado',
    ].forEach((k) => {
      row.getCell(k).numFmt = '"$"#,##0';
    });

    // Tinte por estado
    const tones: Record<string, string> = {
      PAGADO: 'FFD1FAE5',
      PENDIENTE: 'FFFEF3C7',
      VENCIDO: 'FFFEE2E2',
      ANULADO: 'FFE5E7EB',
    };
    const fg = tones[c.estado];
    if (fg) {
      row.getCell('estado').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fg },
      };
      row.getCell('estado').font = { bold: true };
    }
  }

  // Fila TOTAL
  if (cobros.length > 0) {
    const totalRow = ws.addRow({
      consecutivo: 'TOTAL',
      codigoSucursal: '',
      nombreSucursal: '',
      estado: '',
      cantAfiliaciones: cobros.reduce((s, c) => s + c.cantAfiliaciones, 0),
      cantMensualidades: cobros.reduce((s, c) => s + c.cantMensualidades, 0),
      valorAfiliaciones: cobros.reduce((s, c) => s + Number(c.valorAfiliaciones), 0),
      valorMensualidades: cobros.reduce((s, c) => s + Number(c.valorMensualidades), 0),
      totalCobro: totalGenerado,
      fechaGenerado: '',
      fechaLimite: '',
      fechaPagado: '',
      medioPago: '',
      referenciaPago: '',
      pagoEfipay: cantPagadosEfipay,
      sobrecostoEfipay: totalSobrecostoEfipay || '',
      totalCobradoAliado: '',
      paymentIdEfipay: '',
    });
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E7FF' },
      };
    });
    ['valorAfiliaciones', 'valorMensualidades', 'totalCobro', 'sobrecostoEfipay'].forEach((k) => {
      totalRow.getCell(k).numFmt = '"$"#,##0';
    });
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

  // ============================================
  // Hoja 2 — Resumen
  // ============================================
  const ws2 = wb.addWorksheet('Resumen');
  ws2.mergeCells('A1:C1');
  const tit = ws2.getCell('A1');
  tit.value = `Cobros aliados · ${MESES[mes - 1]} ${anio}`;
  tit.font = { bold: true, size: 14 };
  tit.alignment = { horizontal: 'center' };

  let r2 = 3;
  const cantPendiente = cobros.filter((c) => c.estado === 'PENDIENTE').length;
  const cantPagado = cobros.filter((c) => c.estado === 'PAGADO').length;
  const cantVencido = cobros.filter((c) => c.estado === 'VENCIDO').length;
  const cantAnulado = cobros.filter((c) => c.estado === 'ANULADO').length;

  ws2.getCell(`A${r2}`).value = 'Total cobros generados';
  ws2.getCell(`B${r2}`).value = cobros.length;
  r2++;
  ws2.getCell(`A${r2}`).value = '   · Pagados';
  ws2.getCell(`B${r2}`).value = cantPagado;
  r2++;
  ws2.getCell(`A${r2}`).value = '   · Pendientes';
  ws2.getCell(`B${r2}`).value = cantPendiente;
  r2++;
  ws2.getCell(`A${r2}`).value = '   · Vencidos';
  ws2.getCell(`B${r2}`).value = cantVencido;
  r2++;
  ws2.getCell(`A${r2}`).value = '   · Anulados';
  ws2.getCell(`B${r2}`).value = cantAnulado;

  r2 += 2;
  ws2.getCell(`A${r2}`).value = 'Total facturado (todos los estados)';
  ws2.getCell(`A${r2}`).font = { bold: true };
  ws2.getCell(`B${r2}`).value = totalGenerado;
  ws2.getCell(`B${r2}`).numFmt = '"$"#,##0';
  ws2.getCell(`B${r2}`).font = { bold: true };
  r2++;
  ws2.getCell(`A${r2}`).value = 'Total recaudado (estado PAGADO)';
  ws2.getCell(`A${r2}`).font = { bold: true };
  ws2.getCell(`B${r2}`).value = totalRecaudado;
  ws2.getCell(`B${r2}`).numFmt = '"$"#,##0';
  ws2.getCell(`B${r2}`).font = { bold: true };
  r2++;
  ws2.getCell(`A${r2}`).value = 'Pendiente por recaudar';
  ws2.getCell(`B${r2}`).value = totalGenerado - totalRecaudado;
  ws2.getCell(`B${r2}`).numFmt = '"$"#,##0';

  // Pagos por medio
  r2 += 2;
  ws2.getCell(`A${r2}`).value = 'Recaudo por medio de pago';
  ws2.getCell(`A${r2}`).font = { bold: true };
  r2++;
  const porMedio = new Map<string, { count: number; total: number }>();
  for (const c of cobros.filter((x) => x.estado === 'PAGADO')) {
    const trxAprobada = c.efipayTransacciones.find((t) => t.estado === 'APROBADA');
    const medio = trxAprobada ? 'Efipay (pasarela)' : (c.medioPago?.nombre ?? 'Sin clasificar');
    const curr = porMedio.get(medio) ?? { count: 0, total: 0 };
    curr.count++;
    curr.total += Number(c.totalCobro);
    porMedio.set(medio, curr);
  }
  for (const [medio, v] of porMedio.entries()) {
    ws2.getCell(`A${r2}`).value = medio;
    ws2.getCell(`B${r2}`).value = v.count;
    ws2.getCell(`C${r2}`).value = v.total;
    ws2.getCell(`C${r2}`).numFmt = '"$"#,##0';
    r2++;
  }

  // Pasarela Efipay
  r2 += 2;
  ws2.getCell(`A${r2}`).value = 'Pasarela Efipay';
  ws2.getCell(`A${r2}`).font = { bold: true };
  r2++;
  ws2.getCell(`A${r2}`).value = '   · Cobros pagados via Efipay';
  ws2.getCell(`B${r2}`).value = cantPagadosEfipay;
  r2++;
  ws2.getCell(`A${r2}`).value = '   · Sobrecosto recolectado al aliado';
  ws2.getCell(`B${r2}`).value = totalSobrecostoEfipay;
  ws2.getCell(`B${r2}`).numFmt = '"$"#,##0';

  // Por sucursal
  r2 += 2;
  ws2.getCell(`A${r2}`).value = 'Por sucursal';
  ws2.getCell(`A${r2}`).font = { bold: true };
  r2++;
  ws2.getCell(`A${r2}`).value = 'Sucursal';
  ws2.getCell(`B${r2}`).value = 'Cobros';
  ws2.getCell(`C${r2}`).value = 'Total facturado';
  ws2.getCell(`A${r2}`).font = { bold: true, italic: true };
  ws2.getCell(`B${r2}`).font = { bold: true, italic: true };
  ws2.getCell(`C${r2}`).font = { bold: true, italic: true };
  r2++;
  const porSucursal = new Map<string, { count: number; total: number }>();
  for (const c of cobros) {
    const key = `${c.sucursal.codigo} · ${c.sucursal.nombre}`;
    const curr = porSucursal.get(key) ?? { count: 0, total: 0 };
    curr.count++;
    curr.total += Number(c.totalCobro);
    porSucursal.set(key, curr);
  }
  for (const [key, v] of [...porSucursal.entries()].sort((a, b) => b[1].total - a[1].total)) {
    ws2.getCell(`A${r2}`).value = key;
    ws2.getCell(`B${r2}`).value = v.count;
    ws2.getCell(`C${r2}`).value = v.total;
    ws2.getCell(`C${r2}`).numFmt = '"$"#,##0';
    r2++;
  }

  ws2.getColumn(1).width = 44;
  ws2.getColumn(2).width = 14;
  ws2.getColumn(3).width = 20;

  const buffer = await wb.xlsx.writeBuffer();
  const stamp = `${anio}-${String(mes).padStart(2, '0')}`;
  const filename = `cobros_aliados_${stamp}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
