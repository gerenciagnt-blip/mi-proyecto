import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { calcularLiquidacion } from '@/lib/liquidacion/calcular';
import {
  debeFacturarseEnPeriodo,
  opcionesFacturacion,
} from '@/app/admin/transacciones/cartera/helpers';
import { fullName, nombreCompleto } from '@/lib/format';

export const dynamic = 'force-dynamic';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * GET /api/transacciones/cartera/excel
 *
 * Descarga un Excel con el detalle de la cartera del período en curso —
 * es decir, los cotizantes activos que aún NO tienen mensualidad
 * procesada en el mes. Usado por el área administrativa para hacer
 * gestión de cobro.
 *
 * Respeta las mismas reglas de temporalidad que el listado visual
 * (helper `debeFacturarseEnPeriodo`).
 */
export async function GET() {
  await requireAdmin();

  // Período en curso
  const now = new Date();
  const anio = now.getFullYear();
  const mes = now.getMonth() + 1;
  const periodo = await prisma.periodoContable.findUnique({
    where: { anio_mes: { anio, mes } },
  });
  if (!periodo) {
    return NextResponse.json(
      { error: 'No hay período contable del mes en curso' },
      { status: 404 },
    );
  }

  // Cotizantes ya facturados (mensualidad procesada y no anulada)
  const conFactura = await prisma.comprobante.findMany({
    where: {
      periodoId: periodo.id,
      agrupacion: 'INDIVIDUAL',
      tipo: 'MENSUALIDAD',
      estado: { not: 'ANULADO' },
      procesadoEn: { not: null },
    },
    select: { cotizanteId: true },
  });
  const facturadosIds = new Set(
    conFactura.map((c) => c.cotizanteId).filter((x): x is string => x != null),
  );

  // Pendientes = activos que NO están en facturados
  const whereCot: Prisma.CotizanteWhereInput = {
    afiliaciones: { some: { estado: 'ACTIVA' } },
    id: { notIn: Array.from(facturadosIds) },
  };
  const cotizantes = await prisma.cotizante.findMany({
    where: whereCot,
    orderBy: [{ primerApellido: 'asc' }, { primerNombre: 'asc' }],
    include: {
      afiliaciones: {
        where: { estado: 'ACTIVA' },
        include: {
          empresa: {
            select: {
              id: true,
              nombre: true,
              exoneraLey1607: true,
              arl: { select: { nombre: true } },
            },
          },
          cuentaCobro: { select: { razonSocial: true } },
          asesorComercial: { select: { nombre: true } },
          planSgss: {
            select: {
              codigo: true,
              nombre: true,
              incluyeEps: true,
              incluyeAfp: true,
              incluyeArl: true,
              incluyeCcf: true,
            },
          },
          eps: { select: { nombre: true } },
          afp: { select: { nombre: true } },
          arl: { select: { nombre: true } },
          ccf: { select: { nombre: true } },
          serviciosAdicionales: {
            include: {
              servicio: {
                select: { id: true, codigo: true, nombre: true, precio: true },
              },
            },
          },
        },
      },
      gestionesCartera: {
        where: { periodoId: periodo.id },
        select: { id: true },
      },
    },
  });

  // Tarifas + FSP una sola vez
  const [tarifas, fspRangos] = await Promise.all([
    prisma.tarifaSgss.findMany({ where: { active: true } }),
    prisma.fspRango.findMany({
      where: { active: true },
      orderBy: { smlvDesde: 'asc' },
    }),
  ]);

  const cotIdsCartera = cotizantes.map((c) => c.id);
  const conMens =
    cotIdsCartera.length > 0
      ? await prisma.comprobante.findMany({
          where: {
            cotizanteId: { in: cotIdsCartera },
            tipo: 'MENSUALIDAD',
            estado: { not: 'ANULADO' },
            procesadoEn: { not: null },
          },
          select: { cotizanteId: true },
          distinct: ['cotizanteId'],
        })
      : [];
  const cotsConMens = new Set(
    conMens.map((r) => r.cotizanteId).filter((x): x is string => x != null),
  );

  // ------ Armar filas ------
  type Fila = {
    tipoDoc: string;
    numDoc: string;
    nombre: string;
    nombreCompleto: string;
    modalidad: string;
    regimen: string;
    plan: string;
    empresaPlanilla: string;
    empresaCC: string;
    asesor: string;
    fechaIngreso: string;
    salario: number;
    totalLiquidado: number;
    gestiones: number;
  };

  const filas: Fila[] = [];
  let totalCartera = 0;

  for (const c of cotizantes) {
    if (c.afiliaciones.length === 0) continue;

    const afsElegibles = c.afiliaciones.filter((af) =>
      debeFacturarseEnPeriodo(
        {
          modalidad: af.modalidad,
          formaPago: af.formaPago,
          fechaIngreso: af.fechaIngreso,
        },
        { anio: periodo.anio, mes: periodo.mes },
      ),
    );
    if (afsElegibles.length === 0) continue;

    const primera = afsElegibles[0];
    if (!primera) continue;

    const esPrimeraMens = !cotsConMens.has(c.id);

    let totalCot = 0;
    for (const af of afsElegibles) {
      const opciones = opcionesFacturacion(
        {
          modalidad: af.modalidad,
          formaPago: af.formaPago,
          fechaIngreso: af.fechaIngreso,
        },
        { anio: periodo.anio, mes: periodo.mes },
      );
      const calc = calcularLiquidacion(
        {
          afiliacion: {
            id: af.id,
            modalidad: af.modalidad,
            nivelRiesgo: af.nivelRiesgo,
            salario: af.salario,
            valorAdministracion: af.valorAdministracion,
            fechaIngreso: af.fechaIngreso,
            empresa: af.empresa,
            planSgss: af.planSgss,
            eps: af.eps,
            afp: af.afp,
            arl: af.arl,
            ccf: af.ccf,
            serviciosAdicionales: af.serviciosAdicionales.map((s) => ({
              id: s.servicio.id,
              codigo: s.servicio.codigo,
              nombre: s.servicio.nombre,
              precio: s.servicio.precio,
            })),
          },
          periodo: { anio: periodo.anio, mes: periodo.mes },
          smlv: periodo.smlvSnapshot,
          forzarTipo: opciones.forzarTipo ?? 'MENSUALIDAD',
          aplicaArlObligatoria: esPrimeraMens,
        },
        tarifas,
        fspRangos,
      );
      if (!calc) continue;
      totalCot += calc.totalGeneral;
    }

    if (totalCot === 0) continue;
    totalCartera += totalCot;

    const fechaIso = new Date(primera.fechaIngreso)
      .toISOString()
      .slice(0, 10);

    filas.push({
      tipoDoc: c.tipoDocumento,
      numDoc: c.numeroDocumento,
      nombre: fullName(c),
      nombreCompleto: nombreCompleto(c),
      modalidad: primera.modalidad,
      regimen: primera.regimen ?? '—',
      plan: primera.planSgss?.nombre ?? 'Sin plan',
      empresaPlanilla: primera.empresa?.nombre ?? '—',
      empresaCC: primera.cuentaCobro?.razonSocial ?? '—',
      asesor: primera.asesorComercial?.nombre ?? '—',
      fechaIngreso: fechaIso,
      salario: Number(primera.salario),
      totalLiquidado: totalCot,
      gestiones: c.gestionesCartera.length,
    });
  }

  // ------ Construir Excel ------
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema PILA';
  wb.created = new Date();

  const ws = wb.addWorksheet('Cartera');

  ws.columns = [
    { header: 'Tipo doc.', key: 'tipoDoc', width: 10 },
    { header: 'N° documento', key: 'numDoc', width: 16 },
    { header: 'Nombre', key: 'nombre', width: 28 },
    { header: 'Nombre completo', key: 'nombreCompleto', width: 36 },
    { header: 'Modalidad', key: 'modalidad', width: 14 },
    { header: 'Régimen', key: 'regimen', width: 12 },
    { header: 'Plan SGSS', key: 'plan', width: 22 },
    { header: 'Empresa planilla', key: 'empresaPlanilla', width: 26 },
    { header: 'Empresa CC', key: 'empresaCC', width: 26 },
    { header: 'Asesor comercial', key: 'asesor', width: 20 },
    { header: 'Fecha ingreso', key: 'fechaIngreso', width: 13 },
    { header: 'Salario', key: 'salario', width: 14 },
    { header: 'Total a liquidar', key: 'totalLiquidado', width: 16 },
    { header: 'Gestiones', key: 'gestiones', width: 10 },
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
  ws.getRow(1).height = 26;

  for (const f of filas) {
    const row = ws.addRow(f);
    row.getCell('salario').numFmt = '"$"#,##0';
    row.getCell('totalLiquidado').numFmt = '"$"#,##0';
  }

  // Fila total
  if (filas.length > 0) {
    const totalRow = ws.addRow({
      tipoDoc: '',
      numDoc: '',
      nombre: '',
      nombreCompleto: 'TOTAL CARTERA',
      modalidad: '',
      regimen: '',
      plan: '',
      empresaPlanilla: '',
      empresaCC: '',
      asesor: '',
      fechaIngreso: '',
      salario: '',
      totalLiquidado: totalCartera,
      gestiones: filas.length,
    });
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E7FF' },
      };
    });
    totalRow.getCell('totalLiquidado').numFmt = '"$"#,##0';
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columnCount },
  };

  // ------ Hoja 2: Resumen ------
  const ws2 = wb.addWorksheet('Resumen');
  ws2.mergeCells('A1:C1');
  const tit = ws2.getCell('A1');
  tit.value = `Cartera · ${MESES[mes - 1]} ${anio}`;
  tit.font = { bold: true, size: 14 };
  tit.alignment = { horizontal: 'center' };

  let r2 = 3;
  ws2.getCell(`A${r2}`).value = 'Cotizantes pendientes';
  ws2.getCell(`B${r2}`).value = filas.length;
  r2++;
  ws2.getCell(`A${r2}`).value = 'Total a liquidar';
  ws2.getCell(`B${r2}`).value = totalCartera;
  ws2.getCell(`B${r2}`).numFmt = '"$"#,##0';

  // Por modalidad
  r2 += 2;
  ws2.getCell(`A${r2}`).value = 'Por modalidad';
  ws2.getCell(`A${r2}`).font = { bold: true };
  r2++;
  const porModalidad = new Map<string, { count: number; total: number }>();
  for (const f of filas) {
    const curr = porModalidad.get(f.modalidad) ?? { count: 0, total: 0 };
    curr.count++;
    curr.total += f.totalLiquidado;
    porModalidad.set(f.modalidad, curr);
  }
  for (const [mod, v] of porModalidad.entries()) {
    ws2.getCell(`A${r2}`).value = mod;
    ws2.getCell(`B${r2}`).value = v.count;
    ws2.getCell(`C${r2}`).value = v.total;
    ws2.getCell(`C${r2}`).numFmt = '"$"#,##0';
    r2++;
  }

  // Por empresa planilla
  r2 += 2;
  ws2.getCell(`A${r2}`).value = 'Por empresa planilla';
  ws2.getCell(`A${r2}`).font = { bold: true };
  r2++;
  const porEmpresa = new Map<string, { count: number; total: number }>();
  for (const f of filas) {
    const curr = porEmpresa.get(f.empresaPlanilla) ?? {
      count: 0,
      total: 0,
    };
    curr.count++;
    curr.total += f.totalLiquidado;
    porEmpresa.set(f.empresaPlanilla, curr);
  }
  const empresasOrdenadas = Array.from(porEmpresa.entries()).sort(
    (a, b) => b[1].total - a[1].total,
  );
  for (const [emp, v] of empresasOrdenadas) {
    ws2.getCell(`A${r2}`).value = emp;
    ws2.getCell(`B${r2}`).value = v.count;
    ws2.getCell(`C${r2}`).value = v.total;
    ws2.getCell(`C${r2}`).numFmt = '"$"#,##0';
    r2++;
  }

  ws2.getColumn(1).width = 40;
  ws2.getColumn(2).width = 16;
  ws2.getColumn(3).width = 18;

  const buffer = await wb.xlsx.writeBuffer();
  const stamp = `${anio}-${String(mes).padStart(2, '0')}`;
  const filename = `cartera_${stamp}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
