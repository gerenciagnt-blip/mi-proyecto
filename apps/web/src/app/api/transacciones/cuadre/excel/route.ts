import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

const RX_ISO = /^\d{4}-\d{2}-\d{2}$/;

function hoyIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fullName(c: { primerNombre: string; primerApellido: string }) {
  return `${c.primerNombre} ${c.primerApellido}`.trim();
}

function esConceptoInterno(c: { subconcepto: string | null }): boolean {
  return c.subconcepto?.toLowerCase().includes('interno') ?? false;
}

export async function GET(req: Request) {
  await requireAdmin();

  const url = new URL(req.url);
  const rawDesde = url.searchParams.get('desde');
  const rawHasta = url.searchParams.get('hasta');

  const hoy = hoyIso();
  let desdeIso = rawDesde && RX_ISO.test(rawDesde) ? rawDesde : hoy;
  let hastaIso = rawHasta && RX_ISO.test(rawHasta) ? rawHasta : desdeIso;
  if (desdeIso > hastaIso) [desdeIso, hastaIso] = [hastaIso, desdeIso];

  const [yDe, mDe, dDe] = desdeIso.split('-').map(Number);
  const [yHa, mHa, dHa] = hastaIso.split('-').map(Number);
  const desde = new Date(Date.UTC(yDe!, mDe! - 1, dDe!, 0, 0, 0));
  const hasta = new Date(Date.UTC(yHa!, mHa! - 1, dHa!, 0, 0, 0));
  hasta.setUTCDate(hasta.getUTCDate() + 1);

  const comprobantes = await prisma.comprobante.findMany({
    where: {
      fechaPago: { gte: desde, lt: hasta },
      procesadoEn: { not: null },
    },
    orderBy: [{ fechaPago: 'asc' }, { procesadoEn: 'asc' }],
    include: {
      periodo: { select: { anio: true, mes: true } },
      medioPago: { select: { codigo: true, nombre: true } },
      cotizante: {
        select: {
          tipoDocumento: true,
          numeroDocumento: true,
          primerNombre: true,
          primerApellido: true,
        },
      },
      cuentaCobro: { select: { codigo: true, razonSocial: true } },
      asesorComercial: { select: { codigo: true, nombre: true } },
      createdBy: { select: { name: true, email: true } },
      liquidaciones: {
        include: {
          liquidacion: {
            include: {
              conceptos: {
                select: { concepto: true, subconcepto: true, valor: true },
              },
            },
          },
        },
      },
    },
  });

  // ------ Libro Excel ------
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema PILA';
  wb.created = new Date();

  // ===== Hoja 1: Detalle =====
  const ws = wb.addWorksheet('Detalle');

  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Hora', key: 'hora', width: 8 },
    { header: 'Consecutivo', key: 'consecutivo', width: 14 },
    { header: 'N° externo', key: 'numeroExt', width: 14 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Agrupación', key: 'agrupacion', width: 18 },
    { header: 'Destinatario', key: 'destinatario', width: 32 },
    { header: 'Documento / Código', key: 'docCodigo', width: 20 },
    { header: 'Forma de pago', key: 'formaPago', width: 18 },
    { header: 'Medio de pago', key: 'medio', width: 22 },
    { header: 'Usuario', key: 'usuario', width: 22 },
    { header: 'Periodo contable', key: 'periodoContable', width: 16 },
    { header: 'SGSS real', key: 'sgssReal', width: 14 },
    { header: 'SGSS interno', key: 'sgssInterno', width: 14 },
    { header: 'Administración', key: 'admon', width: 14 },
    { header: 'Servicios', key: 'servicios', width: 14 },
    { header: 'Total', key: 'total', width: 16 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Observaciones', key: 'obs', width: 30 },
  ];

  // Estilo encabezado
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  ws.getRow(1).height = 22;

  type Desglose = {
    sgssReal: number;
    sgssInterno: number;
    admon: number;
    servicios: number;
  };

  const totalesActivos: Desglose & { total: number } = {
    sgssReal: 0,
    sgssInterno: 0,
    admon: 0,
    servicios: 0,
    total: 0,
  };
  let totalAnulado = 0;
  let countActivos = 0;
  let countAnulados = 0;

  const porMedio = new Map<
    string,
    { codigo: string; nombre: string; count: number; total: number }
  >();
  const porUsuario = new Map<
    string,
    { nombre: string; count: number; total: number }
  >();

  for (const c of comprobantes) {
    // desglose conceptos
    const d: Desglose = {
      sgssReal: 0,
      sgssInterno: 0,
      admon: 0,
      servicios: 0,
    };
    for (const cl of c.liquidaciones) {
      for (const con of cl.liquidacion.conceptos) {
        const v = Number(con.valor);
        if (con.concepto === 'ADMIN') {
          d.admon += v;
          continue;
        }
        if (con.concepto === 'SERVICIO') {
          d.servicios += v;
          continue;
        }
        if (esConceptoInterno(con)) d.sgssInterno += v;
        else d.sgssReal += v;
      }
    }

    const anulado = c.estado === 'ANULADO';
    const total = Number(c.totalGeneral);

    let destinatario = '—';
    let docCodigo = '';
    if (c.agrupacion === 'INDIVIDUAL' && c.cotizante) {
      destinatario = fullName(c.cotizante);
      docCodigo = `${c.cotizante.tipoDocumento} ${c.cotizante.numeroDocumento}`;
    } else if (c.agrupacion === 'EMPRESA_CC' && c.cuentaCobro) {
      destinatario = c.cuentaCobro.razonSocial;
      docCodigo = c.cuentaCobro.codigo;
    } else if (c.agrupacion === 'ASESOR_COMERCIAL' && c.asesorComercial) {
      destinatario = c.asesorComercial.nombre;
      docCodigo = c.asesorComercial.codigo;
    }

    const fechaPago = c.fechaPago ? new Date(c.fechaPago) : null;
    const fechaIso = fechaPago ? fechaPago.toISOString().slice(0, 10) : '—';
    const hora = c.procesadoEn
      ? new Date(c.procesadoEn).toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '—';

    const medio = c.medioPago
      ? `${c.medioPago.codigo} — ${c.medioPago.nombre}`
      : '—';

    const usuario =
      c.createdBy?.name ?? c.createdBy?.email ?? '—';

    const periodoContable = `${String(c.periodo.mes).padStart(2, '0')}/${c.periodo.anio}`;

    const row = ws.addRow({
      fecha: fechaIso,
      hora,
      consecutivo: c.consecutivo,
      numeroExt: c.numeroComprobanteExt ?? '',
      tipo: c.tipo,
      agrupacion: c.agrupacion,
      destinatario,
      docCodigo,
      formaPago: c.formaPago ?? '',
      medio,
      usuario,
      periodoContable,
      sgssReal: d.sgssReal,
      sgssInterno: d.sgssInterno,
      admon: d.admon,
      servicios: d.servicios,
      total,
      estado: anulado ? 'ANULADO' : 'RECIBIDO',
      obs: c.observaciones ?? '',
    });

    // Formato monetario
    for (const key of [
      'sgssReal',
      'sgssInterno',
      'admon',
      'servicios',
      'total',
    ]) {
      const cell = row.getCell(key);
      cell.numFmt = '"$"#,##0';
    }

    // Color por estado
    if (anulado) {
      row.eachCell((cell) => {
        cell.font = { color: { argb: 'FF9CA3AF' }, strike: true };
      });
      totalAnulado += total;
      countAnulados++;
    } else {
      totalesActivos.sgssReal += d.sgssReal;
      totalesActivos.sgssInterno += d.sgssInterno;
      totalesActivos.admon += d.admon;
      totalesActivos.servicios += d.servicios;
      totalesActivos.total += total;
      countActivos++;

      // Agrupar por medio
      const mKey = c.medioPago?.codigo ?? 'SIN_MEDIO';
      const mNombre = c.medioPago?.nombre ?? 'Sin medio de pago';
      const mCurr = porMedio.get(mKey) ?? {
        codigo: mKey,
        nombre: mNombre,
        count: 0,
        total: 0,
      };
      mCurr.count++;
      mCurr.total += total;
      porMedio.set(mKey, mCurr);

      // Agrupar por usuario
      const uKey = usuario;
      const uCurr = porUsuario.get(uKey) ?? {
        nombre: uKey,
        count: 0,
        total: 0,
      };
      uCurr.count++;
      uCurr.total += total;
      porUsuario.set(uKey, uCurr);
    }
  }

  // Fila TOTAL (solo activos)
  if (countActivos > 0) {
    const totalRow = ws.addRow({
      fecha: '',
      hora: '',
      consecutivo: '',
      numeroExt: '',
      tipo: '',
      agrupacion: '',
      destinatario: 'TOTAL RECIBIDO',
      docCodigo: '',
      formaPago: '',
      medio: '',
      usuario: '',
      periodoContable: '',
      sgssReal: totalesActivos.sgssReal,
      sgssInterno: totalesActivos.sgssInterno,
      admon: totalesActivos.admon,
      servicios: totalesActivos.servicios,
      total: totalesActivos.total,
      estado: '',
      obs: '',
    });
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E7FF' },
      };
    });
    for (const key of [
      'sgssReal',
      'sgssInterno',
      'admon',
      'servicios',
      'total',
    ]) {
      totalRow.getCell(key).numFmt = '"$"#,##0';
    }
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columnCount },
  };

  // ===== Hoja 2: Resumen =====
  const ws2 = wb.addWorksheet('Resumen');

  ws2.mergeCells('A1:D1');
  const tit = ws2.getCell('A1');
  tit.value = `Cuadre de caja · ${
    desdeIso === hastaIso ? desdeIso : `${desdeIso} a ${hastaIso}`
  }`;
  tit.font = { bold: true, size: 14 };
  tit.alignment = { horizontal: 'center' };

  let r2 = 3;
  ws2.getCell(`A${r2}`).value = 'Transacciones recibidas';
  ws2.getCell(`B${r2}`).value = countActivos;
  r2++;
  ws2.getCell(`A${r2}`).value = 'Transacciones anuladas';
  ws2.getCell(`B${r2}`).value = countAnulados;
  r2++;
  ws2.getCell(`A${r2}`).value = 'Total recibido';
  ws2.getCell(`B${r2}`).value = totalesActivos.total;
  ws2.getCell(`B${r2}`).numFmt = '"$"#,##0';
  r2++;
  ws2.getCell(`A${r2}`).value = 'Total anulado';
  ws2.getCell(`B${r2}`).value = totalAnulado;
  ws2.getCell(`B${r2}`).numFmt = '"$"#,##0';

  // Por concepto
  r2 += 2;
  ws2.getCell(`A${r2}`).value = 'Por concepto';
  ws2.getCell(`A${r2}`).font = { bold: true };
  r2++;
  const headConc = ws2.getRow(r2);
  headConc.getCell(1).value = 'Concepto';
  headConc.getCell(2).value = 'Valor';
  headConc.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' },
    };
  });
  r2++;
  const conceptos = [
    ['SGSS (va al operador PILA)', totalesActivos.sgssReal],
    ['Administración', totalesActivos.admon],
    ['Servicios adicionales', totalesActivos.servicios],
    ['Cobros internos (CCF $100 / ARL)', totalesActivos.sgssInterno],
  ] as const;
  for (const [label, val] of conceptos) {
    ws2.getCell(`A${r2}`).value = label;
    ws2.getCell(`B${r2}`).value = val;
    ws2.getCell(`B${r2}`).numFmt = '"$"#,##0';
    r2++;
  }

  // Por medio de pago
  r2 += 1;
  ws2.getCell(`A${r2}`).value = 'Por medio de pago';
  ws2.getCell(`A${r2}`).font = { bold: true };
  r2++;
  const headMed = ws2.getRow(r2);
  headMed.getCell(1).value = 'Medio';
  headMed.getCell(2).value = 'Transacciones';
  headMed.getCell(3).value = 'Total';
  headMed.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' },
    };
  });
  r2++;
  const mediosSorted = Array.from(porMedio.values()).sort(
    (a, b) => b.total - a.total,
  );
  for (const m of mediosSorted) {
    ws2.getCell(`A${r2}`).value = `${m.codigo} — ${m.nombre}`;
    ws2.getCell(`B${r2}`).value = m.count;
    ws2.getCell(`C${r2}`).value = m.total;
    ws2.getCell(`C${r2}`).numFmt = '"$"#,##0';
    r2++;
  }

  // Por usuario
  r2 += 1;
  ws2.getCell(`A${r2}`).value = 'Por usuario';
  ws2.getCell(`A${r2}`).font = { bold: true };
  r2++;
  const headUsr = ws2.getRow(r2);
  headUsr.getCell(1).value = 'Usuario';
  headUsr.getCell(2).value = 'Transacciones';
  headUsr.getCell(3).value = 'Total';
  headUsr.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' },
    };
  });
  r2++;
  const usuariosSorted = Array.from(porUsuario.values()).sort(
    (a, b) => b.total - a.total,
  );
  for (const u of usuariosSorted) {
    ws2.getCell(`A${r2}`).value = u.nombre;
    ws2.getCell(`B${r2}`).value = u.count;
    ws2.getCell(`C${r2}`).value = u.total;
    ws2.getCell(`C${r2}`).numFmt = '"$"#,##0';
    r2++;
  }

  ws2.getColumn(1).width = 38;
  ws2.getColumn(2).width = 16;
  ws2.getColumn(3).width = 18;
  ws2.getColumn(4).width = 16;

  // ------ Serializar ------
  const buffer = await wb.xlsx.writeBuffer();

  // Nombre del archivo
  const stamp = desdeIso === hastaIso ? desdeIso : `${desdeIso}_a_${hastaIso}`;
  const filename = `cuadre-caja_${stamp}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
