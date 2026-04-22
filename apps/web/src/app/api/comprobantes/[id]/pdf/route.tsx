import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { ComprobantePdf, type ComprobantePdfData } from '@/lib/pdf/comprobante-pdf';

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

function fullName(c: {
  primerNombre: string;
  segundoNombre: string | null;
  primerApellido: string;
  segundoApellido: string | null;
}) {
  return [c.primerNombre, c.segundoNombre, c.primerApellido, c.segundoApellido]
    .filter(Boolean)
    .join(' ');
}

function fechaLegible(d: Date) {
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;

  const comp = await prisma.comprobante.findUnique({
    where: { id },
    include: {
      periodo: true,
      cotizante: {
        include: {
          departamento: { select: { nombre: true } },
          municipio: { select: { nombre: true } },
        },
      },
      cuentaCobro: { select: { codigo: true, razonSocial: true, nit: true, dv: true, direccion: true, ciudad: true, telefono: true, email: true, sucursalId: true } },
      asesorComercial: { select: { codigo: true, nombre: true, email: true, telefono: true } },
      medioPago: { select: { codigo: true, nombre: true } },
      liquidaciones: {
        include: {
          liquidacion: {
            include: {
              afiliacion: {
                include: {
                  cotizante: true,
                  empresa: { select: { nombre: true } },
                  eps: { select: { nombre: true } },
                  afp: { select: { nombre: true } },
                  arl: { select: { nombre: true } },
                  ccf: { select: { nombre: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!comp) {
    return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 });
  }

  if (comp.estado === 'ANULADO') {
    return NextResponse.json(
      { error: 'Comprobante anulado — PDF no disponible' },
      { status: 410 },
    );
  }

  // Intentamos encontrar la sucursal para el formato
  // - EMPRESA_CC: la sucursal de la cuenta de cobro
  // - INDIVIDUAL: la sucursal de la primera cuenta de cobro entre las liquidaciones
  // - ASESOR: similar, primera sucursal con cuenta de cobro en las liquidaciones
  let sucursalId: string | null = comp.cuentaCobro?.sucursalId ?? null;
  if (!sucursalId && comp.liquidaciones.length > 0) {
    const primeraConCC = await prisma.liquidacion.findFirst({
      where: {
        id: { in: comp.liquidaciones.map((cl) => cl.liquidacionId) },
        afiliacion: { cuentaCobro: { isNot: null } },
      },
      include: { afiliacion: { include: { cuentaCobro: { select: { sucursalId: true } } } } },
    });
    sucursalId = primeraConCC?.afiliacion.cuentaCobro?.sucursalId ?? null;
  }

  const formato = sucursalId
    ? await prisma.comprobanteFormato.findUnique({
        where: { sucursalId },
        select: {
          nombre: true,
          logoUrl: true,
          encabezado: true,
          pieDePagina: true,
          active: true,
        },
      })
    : null;

  // Destinatario
  let destinatario: ComprobantePdfData['destinatario'];
  if (comp.agrupacion === 'INDIVIDUAL' && comp.cotizante) {
    destinatario = {
      etiqueta: 'Cotizante',
      nombre: fullName(comp.cotizante),
      documento: `${comp.cotizante.tipoDocumento} ${comp.cotizante.numeroDocumento}`,
      direccion: comp.cotizante.direccion ?? undefined,
      ciudad:
        [comp.cotizante.municipio?.nombre, comp.cotizante.departamento?.nombre]
          .filter(Boolean)
          .join(', ') || undefined,
      telefono: comp.cotizante.celular ?? comp.cotizante.telefono ?? undefined,
      email: comp.cotizante.email ?? undefined,
    };
  } else if (comp.agrupacion === 'EMPRESA_CC' && comp.cuentaCobro) {
    destinatario = {
      etiqueta: 'Empresa CC',
      nombre: comp.cuentaCobro.razonSocial,
      documento: comp.cuentaCobro.nit
        ? `NIT ${comp.cuentaCobro.nit}${comp.cuentaCobro.dv ? `-${comp.cuentaCobro.dv}` : ''}`
        : `Código ${comp.cuentaCobro.codigo}`,
      direccion: comp.cuentaCobro.direccion ?? undefined,
      ciudad: comp.cuentaCobro.ciudad ?? undefined,
      telefono: comp.cuentaCobro.telefono ?? undefined,
      email: comp.cuentaCobro.email ?? undefined,
    };
  } else if (comp.agrupacion === 'ASESOR_COMERCIAL' && comp.asesorComercial) {
    destinatario = {
      etiqueta: 'Asesor Comercial',
      nombre: comp.asesorComercial.nombre,
      documento: `Código ${comp.asesorComercial.codigo}`,
      telefono: comp.asesorComercial.telefono ?? undefined,
      email: comp.asesorComercial.email ?? undefined,
    };
  } else {
    destinatario = { etiqueta: 'Destinatario', nombre: '—' };
  }

  // Afiliaciones incluidas
  const afiliaciones = comp.liquidaciones.map((cl) => {
    const af = cl.liquidacion.afiliacion;
    return {
      nombreCotizante: fullName(af.cotizante),
      documento: `${af.cotizante.tipoDocumento} ${af.cotizante.numeroDocumento}`,
      modalidad: af.modalidad,
      nivelRiesgo: af.nivelRiesgo,
      empresa: af.empresa?.nombre ?? null,
      ibc: Number(cl.liquidacion.ibc),
      dias: cl.liquidacion.diasCotizados,
      eps: af.eps?.nombre ?? null,
      afp: af.afp?.nombre ?? null,
      arl: af.arl?.nombre ?? null,
      ccf: af.ccf?.nombre ?? null,
      subtotal: Number(cl.liquidacion.totalGeneral),
    };
  });

  const data: ComprobantePdfData = {
    consecutivo: comp.consecutivo,
    tipo: comp.tipo,
    agrupacion: comp.agrupacion,
    emitidoEn: comp.emitidoEn
      ? fechaLegible(comp.emitidoEn)
      : fechaLegible(comp.createdAt),
    procesadoEn: comp.procesadoEn
      ? fechaLegible(comp.procesadoEn)
      : fechaLegible(comp.createdAt),
    numeroComprobanteExt: comp.numeroComprobanteExt,
    formaPago: comp.formaPago,
    medioPago: comp.medioPago,
    fechaPago: comp.fechaPago ? fechaLegible(comp.fechaPago) : null,

    periodo: {
      anio: comp.periodo.anio,
      mes: comp.periodo.mes,
      mesLabel: MESES[comp.periodo.mes - 1] ?? '',
    },

    destinatario,
    afiliaciones,
    totales: {
      sgss: Number(comp.totalSgss),
      admon: Number(comp.totalAdmon),
      servicios: Number(comp.totalServicios),
      general: Number(comp.totalGeneral),
    },

    formato:
      formato && formato.active
        ? {
            nombre: formato.nombre,
            logoUrl: formato.logoUrl,
            encabezado: formato.encabezado,
            pieDePagina: formato.pieDePagina,
          }
        : null,
  };

  const buffer = await renderToBuffer(<ComprobantePdf data={data} />);

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${comp.consecutivo}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
