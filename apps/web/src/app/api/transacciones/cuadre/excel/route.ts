import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { fullName, hoyIso } from '@/lib/format';

export const dynamic = 'force-dynamic';

const RX_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Identifica si un concepto SGSS es un COBRO INTERNO del aliado (p.ej. CCF $100,
 * ARL 1 día nivel I) por la palabra "interno" en el subconcepto. */
function esConceptoInterno(subconcepto: string | null): boolean {
  return subconcepto?.toLowerCase().includes('interno') ?? false;
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
                select: {
                  concepto: true,
                  subconcepto: true,
                  valor: true,
                  porcentaje: true,
                },
              },
              afiliacion: {
                include: {
                  cotizante: {
                    select: {
                      tipoDocumento: true,
                      numeroDocumento: true,
                      primerNombre: true,
                      primerApellido: true,
                    },
                  },
                  empresa: { select: { nombre: true } },
                  cuentaCobro: { select: { codigo: true, razonSocial: true } },
                  asesorComercial: { select: { codigo: true, nombre: true } },
                  planSgss: { select: { nombre: true } },
                  eps: { select: { nombre: true } },
                  afp: { select: { nombre: true } },
                  arl: { select: { nombre: true } },
                  ccf: { select: { nombre: true } },
                  serviciosAdicionales: {
                    include: { servicio: { select: { nombre: true } } },
                  },
                },
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

  // ===== Hoja 1: Detalle (una fila por liquidación) =====
  const ws = wb.addWorksheet('Detalle');

  ws.columns = [
    { header: 'Fecha proc.', key: 'fechaProc', width: 12 },
    { header: 'Hora proc.', key: 'horaProc', width: 10 },
    { header: 'Consecutivo', key: 'consecutivo', width: 14 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Agrupación', key: 'agrupacion', width: 18 },
    { header: 'Destinatario', key: 'destinatario', width: 30 },
    { header: 'Tipo doc.', key: 'tipoDoc', width: 10 },
    { header: 'N° documento', key: 'numDoc', width: 16 },
    { header: 'Modalidad', key: 'modalidad', width: 14 },
    { header: 'Régimen', key: 'regimen', width: 14 },
    { header: 'Plan SGSS', key: 'planSgss', width: 22 },
    { header: 'Periodo contable', key: 'periodoContable', width: 14 },
    { header: 'Días', key: 'dias', width: 7 },
    { header: 'Primera factura', key: 'primeraFactura', width: 15 },
    { header: 'Retiro', key: 'retiro', width: 8 },
    { header: 'EPS', key: 'eps', width: 22 },
    { header: 'Valor EPS', key: 'valorEps', width: 12 },
    { header: 'AFP', key: 'afp', width: 22 },
    { header: 'Valor AFP', key: 'valorAfp', width: 12 },
    { header: 'Nivel ARL', key: 'nivelArl', width: 10 },
    { header: '% ARL', key: 'pctArl', width: 9 },
    { header: 'Valor ARL', key: 'valorArl', width: 12 },
    { header: 'CCF', key: 'ccf', width: 22 },
    { header: 'Valor CCF', key: 'valorCcf', width: 12 },
    { header: 'Admón', key: 'admon', width: 12 },
    { header: 'Servicios adicionales', key: 'servicios', width: 28 },
    { header: 'Valor servicios', key: 'valorServicios', width: 14 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Usuario', key: 'usuario', width: 22 },
    { header: 'Medio de pago', key: 'medio', width: 22 },
    { header: 'N° comprobante', key: 'numComp', width: 16 },
    { header: 'Fecha comprobante', key: 'fechaComp', width: 14 },
    { header: 'Empresa planilla', key: 'empPlanilla', width: 26 },
    { header: 'Empresa CC', key: 'empCc', width: 26 },
    { header: 'Asesor comercial', key: 'asesor', width: 22 },
    { header: 'N° planilla', key: 'numPlanilla', width: 14 },
    { header: 'Estado pago planilla', key: 'estadoPagoPlanilla', width: 18 },
    { header: 'Observaciones', key: 'obs', width: 30 },
  ];

  // Estilo encabezado
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  ws.getRow(1).height = 30;

  // Columnas monetarias para formato
  const colsMoneda = [
    'valorEps',
    'valorAfp',
    'valorArl',
    'valorCcf',
    'admon',
    'valorServicios',
    'total',
  ];

  // Totales para hoja Resumen (a nivel COMPROBANTE, no liquidación, para evitar doble conteo)
  type DesgloseComp = {
    sgssReal: number;
    sgssInterno: number;
    admon: number;
    servicios: number;
  };
  const totalesActivos = {
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
    const anulado = c.estado === 'ANULADO';
    const totalComp = Number(c.totalGeneral);

    // Destinatario del comprobante
    let destinatario = '—';
    if (c.agrupacion === 'INDIVIDUAL' && c.cotizante) {
      destinatario = fullName(c.cotizante);
    } else if (c.agrupacion === 'EMPRESA_CC' && c.cuentaCobro) {
      destinatario = c.cuentaCobro.razonSocial;
    } else if (c.agrupacion === 'ASESOR_COMERCIAL' && c.asesorComercial) {
      destinatario = c.asesorComercial.nombre;
    }

    const procesadoEn = c.procesadoEn ? new Date(c.procesadoEn) : null;
    const fechaProc = procesadoEn ? procesadoEn.toISOString().slice(0, 10) : '—';
    const horaProc = procesadoEn
      ? procesadoEn.toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'America/Bogota',
        })
      : '—';

    const fechaComp = c.fechaPago
      ? new Date(c.fechaPago).toISOString().slice(0, 10)
      : c.emitidoEn
        ? new Date(c.emitidoEn).toISOString().slice(0, 10)
        : '—';

    const medio = c.medioPago
      ? `${c.medioPago.codigo} — ${c.medioPago.nombre}`
      : '—';
    const usuario = c.createdBy?.name ?? c.createdBy?.email ?? '—';
    const periodoContable = `${String(c.periodo.mes).padStart(2, '0')}/${c.periodo.anio}`;

    // Desglose para resumen (por comprobante)
    const desgComp: DesgloseComp = {
      sgssReal: 0,
      sgssInterno: 0,
      admon: 0,
      servicios: 0,
    };

    // --- Fila por cada liquidación del comprobante ---
    for (const cl of c.liquidaciones) {
      const liq = cl.liquidacion;
      const af = liq.afiliacion;

      // Desglose de conceptos de ESTA liquidación
      let valorEps = 0;
      let valorAfp = 0;
      let valorArl = 0;
      let valorCcf = 0;
      let valorAdmon = 0;
      let valorServicios = 0;
      let pctArl: number | null = null;
      for (const con of liq.conceptos) {
        const v = Number(con.valor);
        const pct = Number(con.porcentaje);
        const interno = esConceptoInterno(con.subconcepto);

        switch (con.concepto) {
          case 'EPS':
            valorEps += v;
            if (!interno) desgComp.sgssReal += v;
            else desgComp.sgssInterno += v;
            break;
          case 'AFP':
            valorAfp += v;
            if (!interno) desgComp.sgssReal += v;
            else desgComp.sgssInterno += v;
            break;
          case 'ARL':
            valorArl += v;
            if (pctArl == null && pct > 0) pctArl = pct;
            if (!interno) desgComp.sgssReal += v;
            else desgComp.sgssInterno += v;
            break;
          case 'CCF':
            valorCcf += v;
            if (!interno) desgComp.sgssReal += v;
            else desgComp.sgssInterno += v;
            break;
          case 'ADMIN':
            valorAdmon += v;
            desgComp.admon += v;
            break;
          case 'SERVICIO':
            valorServicios += v;
            desgComp.servicios += v;
            break;
          default:
            // SENA/ICBF/FSP (u otros) → suman al SGSS real
            if (!interno) desgComp.sgssReal += v;
            else desgComp.sgssInterno += v;
        }
      }

      const serviciosNombres = af.serviciosAdicionales
        .map((s) => s.servicio.nombre)
        .join(', ');

      const primeraFactura = liq.tipo === 'VINCULACION' ? 'SI' : 'NO';
      const retiro = c.aplicaNovedadRetiro ? 'SI' : 'NO';
      const estadoPagoPlanilla = c.numeroPlanilla ? 'PROCESADA' : 'EN PROCESO';

      const row = ws.addRow({
        fechaProc,
        horaProc,
        consecutivo: c.consecutivo,
        tipo: c.tipo,
        agrupacion: c.agrupacion,
        destinatario,
        tipoDoc: af.cotizante.tipoDocumento,
        numDoc: af.cotizante.numeroDocumento,
        modalidad: af.modalidad,
        regimen: af.regimen ?? '—',
        planSgss: af.planSgss?.nombre ?? '—',
        periodoContable,
        dias: liq.diasCotizados,
        primeraFactura,
        retiro,
        eps: af.eps?.nombre ?? '—',
        valorEps,
        afp: af.afp?.nombre ?? '—',
        valorAfp,
        nivelArl: af.nivelRiesgo,
        pctArl: pctArl != null ? pctArl / 100 : null,
        valorArl,
        ccf: af.ccf?.nombre ?? '—',
        valorCcf,
        admon: valorAdmon,
        servicios: serviciosNombres || '—',
        valorServicios,
        total: Number(liq.totalGeneral),
        estado: anulado ? 'ANULADO' : 'RECIBIDO',
        usuario,
        medio,
        numComp: c.numeroComprobanteExt ?? '',
        fechaComp,
        empPlanilla: af.empresa?.nombre ?? '—',
        empCc:
          c.cuentaCobro?.razonSocial ?? af.cuentaCobro?.razonSocial ?? '—',
        asesor:
          c.asesorComercial?.nombre ?? af.asesorComercial?.nombre ?? '—',
        numPlanilla: c.numeroPlanilla ?? '',
        estadoPagoPlanilla,
        obs: c.observaciones ?? '',
      });

      // Formato monetario
      for (const key of colsMoneda) {
        row.getCell(key).numFmt = '"$"#,##0';
      }
      // % ARL
      row.getCell('pctArl').numFmt = '0.0000%';

      // Tachado + gris si anulado
      if (anulado) {
        row.eachCell((cell) => {
          cell.font = { color: { argb: 'FF9CA3AF' }, strike: true, size: 10 };
        });
      } else {
        row.eachCell((cell) => {
          cell.font = { size: 10 };
        });
      }
    }

    // Acumular a nivel de comprobante (para no doble contar)
    if (anulado) {
      totalAnulado += totalComp;
      countAnulados++;
    } else {
      totalesActivos.sgssReal += desgComp.sgssReal;
      totalesActivos.sgssInterno += desgComp.sgssInterno;
      totalesActivos.admon += desgComp.admon;
      totalesActivos.servicios += desgComp.servicios;
      totalesActivos.total += totalComp;
      countActivos++;

      const mKey = c.medioPago?.codigo ?? 'SIN_MEDIO';
      const mNombre = c.medioPago?.nombre ?? 'Sin medio de pago';
      const mCurr = porMedio.get(mKey) ?? {
        codigo: mKey,
        nombre: mNombre,
        count: 0,
        total: 0,
      };
      mCurr.count++;
      mCurr.total += totalComp;
      porMedio.set(mKey, mCurr);

      const uCurr = porUsuario.get(usuario) ?? {
        nombre: usuario,
        count: 0,
        total: 0,
      };
      uCurr.count++;
      uCurr.total += totalComp;
      porUsuario.set(usuario, uCurr);
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
    ['Cobros internos (CCF $100 / ARL 1 día)', totalesActivos.sgssInterno],
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
